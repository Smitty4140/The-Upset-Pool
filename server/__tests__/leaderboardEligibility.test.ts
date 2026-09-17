import { describe, it, expect } from "vitest";
import { lockedWeeksForSeason } from "../leaderboardEligibility";

// A finished 2025 season sitting in nfl_weeks alongside a 2026 season that is
// two weeks in — the shape that broke the leaderboard's two right-hand columns.
const WEEKS = [
  { id: 101, season: 2025, weekNumber: 17, picksLockAt: "2025-12-28T18:00:00Z" },
  { id: 102, season: 2025, weekNumber: 18, picksLockAt: "2026-01-04T18:00:00Z" },
  { id: 201, season: 2026, weekNumber: 1, picksLockAt: "2026-09-13T17:00:00Z" },
  { id: 202, season: 2026, weekNumber: 2, picksLockAt: "2026-09-20T17:00:00Z" },
];

// Midway through 2026 week 2: week 1 has locked, week 2 has not.
const DURING_WEEK_2 = new Date("2026-09-17T12:00:00Z");

describe("lockedWeeksForSeason", () => {
  it("counts only the league's own season", () => {
    const weeks = lockedWeeksForSeason(WEEKS, 2026, DURING_WEEK_2);
    expect(weeks.map((w) => w.id)).toEqual([201]);
  });

  it("leaves an unlocked week out", () => {
    const weeks = lockedWeeksForSeason(WEEKS, 2026, DURING_WEEK_2);
    expect(weeks.some((w) => w.weekNumber === 2)).toBe(false);
  });

  it("ends on the most recently locked week, which is what Last Pick reports", () => {
    const weeks = lockedWeeksForSeason(WEEKS, 2026, DURING_WEEK_2);
    expect(weeks[weeks.length - 1]?.weekNumber).toBe(1);

    // Once week 2 locks it becomes the last pick on show.
    const afterWeek2 = lockedWeeksForSeason(WEEKS, 2026, new Date("2026-09-21T12:00:00Z"));
    expect(afterWeek2[afterWeek2.length - 1]?.weekNumber).toBe(2);
  });

  it("keeps an every-week streak reachable one week into a season", () => {
    // The bug: 2025's locked weeks were counted too, so a 2026 member needed
    // three picks to look eligible after a single week of play.
    const required = lockedWeeksForSeason(WEEKS, 2026, DURING_WEEK_2).length;
    expect(required).toBe(1);
  });

  it("returns weeks oldest first", () => {
    const weeks = lockedWeeksForSeason(WEEKS, 2026, new Date("2026-09-21T12:00:00Z"));
    expect(weeks.map((w) => w.weekNumber)).toEqual([1, 2]);
  });

  it("has nothing to measure before the first week locks", () => {
    expect(lockedWeeksForSeason(WEEKS, 2026, new Date("2026-09-10T12:00:00Z"))).toEqual([]);
  });

  it("reads a Date picksLockAt the same as a string one", () => {
    const asDates = WEEKS.map((w) => ({ ...w, picksLockAt: new Date(w.picksLockAt) }));
    expect(lockedWeeksForSeason(asDates, 2026, DURING_WEEK_2).map((w) => w.id)).toEqual([201]);
  });

  it("falls back to every season when a league has no season recorded", () => {
    // Every locked week, ordered by week number alone — 2026 week 1 lands ahead
    // of 2025 weeks 17 and 18. Ordering across seasons has no real meaning,
    // which is the reason a league scopes to its own.
    const weeks = lockedWeeksForSeason(WEEKS, null, DURING_WEEK_2);
    expect(weeks.map((w) => w.id)).toEqual([201, 101, 102]);
  });
});
