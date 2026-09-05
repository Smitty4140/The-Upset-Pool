import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(import.meta.dirname, "../scheduler.ts"), "utf8");

function bodyBetween(start: string, end: string) {
  const from = SRC.indexOf(start);
  const to = SRC.indexOf(end);
  expect(from, `could not find ${start}`).toBeGreaterThan(-1);
  expect(to, `could not find ${end}`).toBeGreaterThan(from);
  return SRC.slice(from, to);
}

/**
 * Guards one specific regression, structurally.
 *
 * Both send paths wrap their whole body in try/catch and return zero on error.
 * So any throw from the send-log helpers — most plausibly "relation
 * email_notifications does not exist" when `npm run db:push` has not been run —
 * gets swallowed and the week goes out with no email and no obvious cause. A
 * silent zero-send is the worst outcome available for a feature whose entire
 * job is sending email, and it looks identical to "nobody needed one".
 *
 * These read the source rather than the behavior on purpose: proving the
 * absence of a throw across every database failure mode is not something a
 * mock can do, but the shape of the code says it directly.
 */
describe("a missing email_notifications table must not silence the emails", () => {
  it("alreadyNotified handles its own failure and degrades to in-memory dedupe", () => {
    const fn = bodyBetween("private async alreadyNotified", "private async recordNotification");

    expect(fn).toMatch(/try\s*\{/);
    expect(fn).toMatch(/catch/);
    // Degrades rather than rethrowing, so the run continues and mail goes out.
    expect(fn).toMatch(/memoryNotified/);
    expect(fn).not.toMatch(/\bthrow\b/);
    // And says what to do about it.
    expect(fn).toMatch(/db:push/);
  });

  it("recordNotification cannot abort a send run either", () => {
    const fn = bodyBetween("private async recordNotification", "private async getNotifiableMembers");

    expect(fn).toMatch(/try\s*\{/);
    expect(fn).toMatch(/catch/);
    expect(fn).not.toMatch(/\bthrow\b/);
  });

  it("in-memory dedupe is actually populated, or the fallback is inert", () => {
    // A fallback set that nothing writes to would let the five-minute lock
    // check mail the same member twelve times in the hour.
    const fn = bodyBetween("private async recordNotification", "private async getNotifiableMembers");
    expect(fn).toMatch(/memoryNotified\.add/);
  });
});
