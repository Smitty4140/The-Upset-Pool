import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * The incident these cover: production is a Replit Autoscale deployment, where
 * a container only runs while it is serving a request. A `node-cron` timer set
 * for "eight hours before kickoff" therefore fires only if some container
 * happens to be awake at that minute — and twice now none was, so the week's
 * spreads never posted and the "picks are open" email never went out until an
 * admin pressed the button by hand. The button worked because it is an HTTP
 * request, and a request is the one context that reliably gets CPU.
 *
 * The fix is to kick the same work from requests and from an external
 * heartbeat, which only works if two things hold: kicking it constantly still
 * runs it once (the lease), and a kick can never break or noticeably slow the
 * request that carried it (the tick).
 */

const execute = vi.fn();
vi.mock("../db.js", () => ({ db: { execute: (...args: any[]) => execute(...args) } }));

const runDueWork = vi.fn();
vi.mock("../scheduler.js", () => ({ gameScheduler: { runDueWork: (...a: any[]) => runDueWork(...a) } }));

import { claimSchedulerLease, resetLeasesForTest } from "../schedulerLease";
import { runSchedulerTick, kickSchedulerTick, resetTickForTest, getLastTick, secretMatches } from "../schedulerTick";

beforeEach(() => {
  execute.mockReset();
  runDueWork.mockReset();
  runDueWork.mockResolvedValue({ spreads: { ran: true } });
  resetLeasesForTest();
  resetTickForTest();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the lease decides who actually does the work", () => {
  it("claims the job when the conditional upsert returns a row", async () => {
    execute.mockResolvedValue({ rows: [{ job: "spreads" }] });
    await expect(claimSchedulerLease("spreads", 60_000, "request")).resolves.toBe(true);
  });

  it("stands down when another caller already has the window", async () => {
    // No row back means the WHERE clause rejected the update: someone else
    // ran this job inside the interval. Two containers, one pull.
    execute.mockResolvedValue({ rows: [] });
    await expect(claimSchedulerLease("spreads", 60_000, "request")).resolves.toBe(false);
  });

  it("falls back to a per-process lease rather than throwing when the table is missing", async () => {
    // "relation scheduler_leases does not exist" — db:push not run yet. A late
    // or duplicated email beats a week with no email at all, so the work still
    // happens; the send log keeps the duplicate from reaching members.
    execute.mockRejectedValue(new Error('relation "scheduler_leases" does not exist'));

    await expect(claimSchedulerLease("spreads", 60_000, "cron")).resolves.toBe(true);
    await expect(claimSchedulerLease("spreads", 60_000, "cron")).resolves.toBe(false);
  });

  it("holds each job's window separately", async () => {
    execute.mockRejectedValue(new Error("no table"));
    await expect(claimSchedulerLease("spreads", 60_000, "cron")).resolves.toBe(true);
    await expect(claimSchedulerLease("lock-warnings", 60_000, "cron")).resolves.toBe(true);
  });
});

describe("a tick carried by request traffic", () => {
  it("runs the due work", async () => {
    await runSchedulerTick("request");
    expect(runDueWork).toHaveBeenCalledWith("request");
    expect(getLastTick()?.ran).toBe(true);
  });

  it("does not re-check on every request", async () => {
    // Every API call kicks this. Without the gap, a busy minute would be
    // hundreds of lease round trips for work that runs every few minutes.
    await runSchedulerTick("request");
    const second = await runSchedulerTick("request");
    expect(runDueWork).toHaveBeenCalledTimes(1);
    expect(second.ran).toBe(false);
    expect(second.skipped).toBeTruthy();
  });

  it("lets the heartbeat through that gap", async () => {
    // The heartbeat is the caller that matters when nobody is on the site,
    // which is precisely the state the missing email leaves the league in.
    await runSchedulerTick("request");
    await runSchedulerTick("heartbeat", { force: true });
    expect(runDueWork).toHaveBeenCalledTimes(2);
  });

  it("shares one run between requests that arrive together", async () => {
    let release: (v: unknown) => void = () => {};
    runDueWork.mockImplementation(() => new Promise(resolve => { release = resolve; }));

    const ticks = Promise.all([runSchedulerTick("request"), runSchedulerTick("request")]);
    await vi.waitFor(() => expect(runDueWork).toHaveBeenCalled());
    release({});
    await ticks;

    expect(runDueWork).toHaveBeenCalledTimes(1);
  });

  it("never lets a failed job break the request that carried it", async () => {
    runDueWork.mockRejectedValue(new Error("Odds API is down"));
    const summary = await runSchedulerTick("request");
    expect(summary.error).toMatch(/Odds API is down/);
    await expect(kickSchedulerTick("request")).resolves.toBeUndefined();
  });

  it("hands the response back rather than waiting out a slow pull", async () => {
    // A pull that takes a minute must not hold a member's page load for a
    // minute. The kick waits out its budget and lets the rest finish after.
    vi.useFakeTimers();
    runDueWork.mockImplementation(() => new Promise(() => {}));

    let returned = false;
    const kick = kickSchedulerTick("request").then(() => { returned = true; });

    await vi.advanceTimersByTimeAsync(10_000);
    await kick;
    expect(returned).toBe(true);
  });
});

const ROUTES = readFileSync(resolve(import.meta.dirname, "../routes.ts"), "utf8");

describe("the app is wired so requests and a heartbeat can drive the scheduler", () => {
  it("API traffic kicks a tick", () => {
    expect(ROUTES).toMatch(/app\.use\('\/api', schedulerTickMiddleware\(\)\)/);
  });

  it("the heartbeat endpoint exists and is gated on a secret", () => {
    const fn = ROUTES.slice(ROUTES.indexOf("app.all('/api/cron/tick'"));
    expect(fn.slice(0, 2000)).toMatch(/process\.env\.CRON_SECRET/);
    expect(fn.slice(0, 2000)).toMatch(/secretMatches\(provided, expected\)/);
    expect(fn.slice(0, 2000)).toMatch(/runSchedulerTick\('heartbeat', \{ force: true \}\)/);
  });

  it("the admin status page can see when each job last ran", () => {
    // Read from the database, not from this container's memory: after an
    // Autoscale recycle the in-memory view is minutes old and says nothing
    // about whether the automation ever ran.
    expect(ROUTES).toMatch(/const leases = await readSchedulerLeases\(\);/);
  });
});

describe("the heartbeat's secret check", () => {
  it("accepts the configured secret and nothing else", () => {
    expect(secretMatches("s3cret", "s3cret")).toBe(true);
    expect(secretMatches("s3cret", "s3creT")).toBe(false);
  });

  it("does not throw on a wrong-length guess", () => {
    // timingSafeEqual throws on mismatched buffers, and an exception here
    // would both 500 the endpoint and leak the secret's length.
    expect(secretMatches("x", "a-much-longer-secret")).toBe(false);
    expect(secretMatches("", "a-much-longer-secret")).toBe(false);
  });

  it("refuses everything when the deployment has no secret set", () => {
    expect(secretMatches("anything", "")).toBe(false);
  });
});
