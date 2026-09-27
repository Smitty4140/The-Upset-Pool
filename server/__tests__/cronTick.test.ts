import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { checkCronSecret, presentedCronSecret } from "../cronAuth";

const SCHEDULER = readFileSync(resolve(import.meta.dirname, "../scheduler.ts"), "utf8");
const ROUTES = readFileSync(resolve(import.meta.dirname, "../routes.ts"), "utf8");

function bodyBetween(src: string, start: string, end: string) {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + 1);
  expect(from, `could not find ${start}`).toBeGreaterThan(-1);
  expect(to, `could not find ${end}`).toBeGreaterThan(from);
  return src.slice(from, to);
}

describe("cron secret", () => {
  it("refuses every caller when CRON_SECRET is unset", () => {
    expect(checkCronSecret(undefined, "anything")).toMatchObject({ ok: false, status: 503 });
    expect(checkCronSecret("", "")).toMatchObject({ ok: false, status: 503 });
  });

  it("refuses a missing or wrong secret", () => {
    expect(checkCronSecret("s3cret", undefined)).toMatchObject({ ok: false, status: 401 });
    expect(checkCronSecret("s3cret", "nope")).toMatchObject({ ok: false, status: 401 });
    expect(checkCronSecret("s3cret", "s3cret-longer")).toMatchObject({ ok: false, status: 401 });
  });

  it("accepts the right secret", () => {
    expect(checkCronSecret("s3cret", "s3cret")).toEqual({ ok: true });
  });

  it("reads the secret from a bearer header, X-Cron-Secret, or ?key=", () => {
    expect(presentedCronSecret({ headers: { authorization: "Bearer abc" } })).toBe("abc");
    expect(presentedCronSecret({ headers: { "x-cron-secret": "abc" } })).toBe("abc");
    expect(presentedCronSecret({ headers: {}, query: { key: "abc" } })).toBe("abc");
    expect(presentedCronSecret({ headers: {}, query: {} })).toBeUndefined();
  });
});

/**
 * Structural, like spreadPullWiring.test.ts: the scheduler cannot be imported
 * without a live database.
 */
describe("the external tick drives the time-critical work", () => {
  it("is routed, unauthenticated by session but gated on the cron secret", () => {
    const fn = bodyBetween(ROUTES, "const cronTick", "app.get('/api/cron/tick'");
    expect(fn).toMatch(/checkCronSecret\(process\.env\.CRON_SECRET/);
    expect(fn).toMatch(/await gameScheduler\.runDueWork\(\)/);
    expect(ROUTES).toMatch(/app\.post\('\/api\/cron\/tick', cronTick\)/);
  });

  it("awaits both the spreads sweep and the lock warnings", () => {
    const fn = bodyBetween(SCHEDULER, "async runDueWork", "private inFlight");
    expect(fn).toMatch(/await this\.singleFlight\('spreads', \(\) => this\.sweepSpreadPulls\(\)\)/);
    expect(fn).toMatch(/await this\.singleFlight\('lock-warnings', \(\) => this\.checkPickLockWarnings\(\)\)/);
  });

  it("shares one in-flight run with the in-process cron, so they cannot double-send", () => {
    const start = bodyBetween(SCHEDULER, "start() {", "stop() {");
    expect(start).toMatch(/singleFlight\('spreads', \(\) => this\.sweepSpreadPulls\(\)\)/);
    expect(start).toMatch(/singleFlight\('lock-warnings', \(\) => this\.checkPickLockWarnings\(\)\)/);
  });

  it("runs the lock warning on startup too, not only at the next five-minute mark", () => {
    const start = bodyBetween(SCHEDULER, "start() {", "stop() {");
    expect(start).toMatch(/Also run immediately on startup[\s\S]*this\.runDueWork\(\)/);
  });

  it("the one-hour window includes its far end, so the 12:00 tick catches a 1:00 lock", () => {
    const check = bodyBetween(SCHEDULER, "async checkPickLockWarnings", "async sendPickLockWarnings");
    expect(check).toMatch(/lte\(nflWeeks\.picksLockAt, oneHourOut\)/);
    expect(check).not.toMatch(/\blt\(nflWeeks\.picksLockAt/);
  });
});
