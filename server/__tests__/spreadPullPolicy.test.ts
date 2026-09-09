import { describe, it, expect } from "vitest";
import {
  announcementDue,
  decideSpreadPull,
  spreadPullTime,
  hasSpread,
  MAX_SPREAD_PULL_ATTEMPTS,
  SPREAD_PULL_RETRY_MS,
} from "../spreadPullPolicy";

// A real week 2 of the 2026 season: picks lock Sunday 1 PM ET, the Thursday
// game kicks off at 8:15 PM ET, so spreads are due Thursday 12:15 PM ET.
const WEEK = {
  id: 2,
  weekNumber: 2,
  picksLockAt: new Date("2026-09-20T17:00:00Z"), // Sun 1:00 PM ET
};
const THURSDAY_KICKOFF = "2026-09-18T00:15:00Z"; // Thu 8:15 PM ET
const SUNDAY_KICKOFF = "2026-09-20T17:00:00Z";
const DUE_AT = Date.parse("2026-09-17T16:15:00Z"); // Thu 12:15 PM ET

const game = (over: Partial<{ gameTime: string; spread: unknown; updatedAt: string | null }> = {}) => ({
  gameTime: SUNDAY_KICKOFF,
  spread: "0",
  updatedAt: null,
  ...over,
});

/** A full board with no lines posted, last touched when the schedule was seeded. */
const emptyBoard = () => [
  game({ gameTime: THURSDAY_KICKOFF, updatedAt: "2026-09-01T00:00:00Z" }),
  game({ updatedAt: "2026-09-01T00:00:00Z" }),
  game({ updatedAt: "2026-09-01T00:00:00Z" }),
];

describe("hasSpread", () => {
  it("reads 0 in every shape the decimal column returns as 'not pulled yet'", () => {
    expect(hasSpread({ spread: "0" })).toBe(false);
    expect(hasSpread({ spread: "0.0" })).toBe(false);
    expect(hasSpread({ spread: 0 })).toBe(false);
    expect(hasSpread({ spread: null })).toBe(false);
    expect(hasSpread({ spread: undefined })).toBe(false);
  });

  it("counts a posted line, either direction", () => {
    expect(hasSpread({ spread: "-3.5" })).toBe(true);
    expect(hasSpread({ spread: "7" })).toBe(true);
    expect(hasSpread({ spread: 2.5 })).toBe(true);
  });
});

describe("spreadPullTime", () => {
  it("is eight hours before the week's first kickoff", () => {
    expect(spreadPullTime(WEEK, emptyBoard()).toISOString()).toBe("2026-09-17T16:15:00.000Z");
  });

  it("uses the earliest kickoff even when the games arrive out of order", () => {
    const outOfOrder = [game(), game({ gameTime: THURSDAY_KICKOFF }), game()];
    expect(spreadPullTime(WEEK, outOfOrder).toISOString()).toBe("2026-09-17T16:15:00.000Z");
  });

  it("falls back to a Thursday-noon trigger when the week has no games at all", () => {
    // The regression that broke week 1: the trigger was read off the games,
    // but the pull is what creates them, so an unseeded week never pulled.
    const pullAt = spreadPullTime(WEEK, []);
    expect(pullAt.toISOString()).toBe("2026-09-17T16:00:00.000Z");
    expect(pullAt.toLocaleString("en-US", { timeZone: "America/New_York" })).toContain("12:00:00 PM");
  });
});

describe("decideSpreadPull", () => {
  it("waits until the trigger time", () => {
    const decision = decideSpreadPull(WEEK, emptyBoard(), DUE_AT - 60_000);
    expect(decision.status).toBe("waiting");
    expect(decision.pull).toBe(false);
  });

  it("pulls once the trigger time arrives", () => {
    const decision = decideSpreadPull(WEEK, emptyBoard(), DUE_AT);
    expect(decision.status).toBe("due");
    expect(decision.pull).toBe(true);
    expect(decision.missing).toBe(3);
  });

  it("pulls for a week with no games once its fallback trigger passes", () => {
    const decision = decideSpreadPull(WEEK, [], Date.parse("2026-09-17T16:30:00Z"));
    expect(decision.status).toBe("due");
    expect(decision.pull).toBe(true);
    expect(decision.total).toBe(0);
  });

  it("catches up a trigger that was missed while nothing was running", () => {
    // The autoscale case: no instance was alive at 12:15, and the one that
    // cold-starts at 6 PM has to pull rather than conclude it is too late.
    const decision = decideSpreadPull(WEEK, emptyBoard(), Date.parse("2026-09-17T22:00:00Z"));
    expect(decision.pull).toBe(true);
  });

  it("does nothing once every game has a spread", () => {
    const board = emptyBoard().map(g => ({ ...g, spread: "-3.5" }));
    const decision = decideSpreadPull(WEEK, board, DUE_AT + 60 * 60 * 1000);
    expect(decision.status).toBe("complete");
    expect(decision.pull).toBe(false);
  });

  it("still fills in a board that only partly posted", () => {
    const board = emptyBoard();
    board[0] = { ...board[0], spread: "-3.5" };
    const decision = decideSpreadPull(WEEK, board, DUE_AT + 60 * 60 * 1000);
    expect(decision.status).toBe("due");
    expect(decision.missing).toBe(2);
  });

  it("stops at picks lock", () => {
    const decision = decideSpreadPull(WEEK, emptyBoard(), Date.parse("2026-09-20T17:00:00Z"));
    expect(decision.status).toBe("locked");
    expect(decision.pull).toBe(false);
  });

  it("throttles on a recent attempt recorded in this process", () => {
    const attempts = { count: 1, lastAttemptAt: DUE_AT };
    const decision = decideSpreadPull(WEEK, emptyBoard(), DUE_AT + SPREAD_PULL_RETRY_MS - 1, attempts);
    expect(decision.status).toBe("throttled");
  });

  it("retries once the throttle window is over", () => {
    const attempts = { count: 1, lastAttemptAt: DUE_AT };
    const decision = decideSpreadPull(WEEK, emptyBoard(), DUE_AT + SPREAD_PULL_RETRY_MS, attempts);
    expect(decision.status).toBe("due");
  });

  it("throttles on the games' own updatedAt, so a cold start cannot stampede the API", () => {
    // A restart loses the in-memory counter. Without the database-backed
    // throttle, every cold start on an autoscale deployment would spend
    // another Odds API request.
    const board = emptyBoard().map(g => ({ ...g, updatedAt: new Date(DUE_AT).toISOString() }));
    const decision = decideSpreadPull(WEEK, board, DUE_AT + 60_000, { count: 0, lastAttemptAt: 0 });
    expect(decision.status).toBe("throttled");
  });

  it("gives up after the attempt budget rather than draining the API quota", () => {
    const attempts = { count: MAX_SPREAD_PULL_ATTEMPTS, lastAttemptAt: 0 };
    const decision = decideSpreadPull(WEEK, emptyBoard(), DUE_AT + 24 * 60 * 60 * 1000, attempts);
    expect(decision.status).toBe("exhausted");
    expect(decision.pull).toBe(false);
  });
});

describe("announcementDue", () => {
  const posted = () => emptyBoard().map(g => ({ ...g, spread: "-3.5" }));

  it("is due once the board is up and the trigger has passed", () => {
    expect(announcementDue(WEEK, posted(), DUE_AT)).toBe(true);
  });

  it("is not due before the trigger, even with lines already in the database", () => {
    // Lines can land early — a manual pull, or one that was not scoped to a
    // single week. That must not announce next week's board days ahead.
    expect(announcementDue(WEEK, posted(), DUE_AT - 60_000)).toBe(false);
  });

  it("is due before the trigger when this caller's pull just put the board up", () => {
    // An admin pressing the button is saying so explicitly.
    expect(announcementDue(WEEK, posted(), DUE_AT - 60_000, { pulledFromEmpty: true })).toBe(true);
  });

  it("is not due when the board is still empty", () => {
    expect(announcementDue(WEEK, emptyBoard(), DUE_AT)).toBe(false);
    expect(announcementDue(WEEK, emptyBoard(), DUE_AT, { pulledFromEmpty: true })).toBe(false);
  });

  it("is not due once picks have locked", () => {
    const afterLock = Date.parse("2026-09-20T17:00:00Z");
    expect(announcementDue(WEEK, posted(), afterLock)).toBe(false);
    expect(announcementDue(WEEK, posted(), afterLock, { pulledFromEmpty: true })).toBe(false);
  });

  it("stays due after the trigger, so a week whose pull was a no-op is still announced", () => {
    // The hole this closes: the email used to be a side effect of the pull,
    // so a week that needed no pull got no email.
    expect(announcementDue(WEEK, posted(), DUE_AT + 6 * 60 * 60 * 1000)).toBe(true);
  });
});
