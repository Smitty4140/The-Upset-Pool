import { describe, it, expect } from "vitest";
import { easternDateString, calendarDateString, findWeekForKickoff } from "../timezoneUtils";

// Two consecutive 2026 weeks, exactly as the ESPN seeder writes them.
const WEEKS = [
  { weekNumber: 2, startDate: "2026-09-16", endDate: "2026-09-22" },
  { weekNumber: 3, startDate: "2026-09-23", endDate: "2026-09-29" },
];

describe("easternDateString", () => {
  it("keeps a late kickoff on its Eastern calendar day", () => {
    // 8:20 PM ET Sunday is already Monday in UTC.
    expect(easternDateString(new Date("2026-09-21T00:20:00Z"))).toBe("2026-09-20");
    // 8:15 PM ET Monday is Tuesday in UTC.
    expect(easternDateString(new Date("2026-09-22T00:15:00Z"))).toBe("2026-09-21");
  });

  it("handles an afternoon kickoff, where UTC and ET agree on the date", () => {
    expect(easternDateString(new Date("2026-09-20T17:00:00Z"))).toBe("2026-09-20");
  });
});

describe("calendarDateString", () => {
  it("trims a date column string without reinterpreting it", () => {
    expect(calendarDateString("2026-09-16")).toBe("2026-09-16");
  });

  it("reads a Date at UTC midnight as that same calendar day", () => {
    // Converting this one to ET would walk it back to the 15th.
    expect(calendarDateString(new Date("2026-09-16T00:00:00Z"))).toBe("2026-09-16");
  });
});

describe("findWeekForKickoff", () => {
  it("buckets a Thursday night game", () => {
    // Thu 8:15 PM ET = Friday 00:15 UTC.
    expect(findWeekForKickoff(WEEKS, new Date("2026-09-18T00:15:00Z"))?.weekNumber).toBe(2);
  });

  it("buckets a Sunday night game into its own week, not the next one", () => {
    expect(findWeekForKickoff(WEEKS, new Date("2026-09-21T00:20:00Z"))?.weekNumber).toBe(2);
  });

  it("keeps the Monday night game inside the week that ends that Tuesday", () => {
    // The regression this guards: bucketing on the UTC date makes this
    // 2026-09-22, which for a week ending Monday would fall off the schedule
    // and the game would be logged as "could not find week" and skipped.
    expect(findWeekForKickoff(WEEKS, new Date("2026-09-22T00:15:00Z"))?.weekNumber).toBe(2);
  });

  it("does not claim a game that belongs to the following week", () => {
    expect(findWeekForKickoff(WEEKS, new Date("2026-09-25T00:15:00Z"))?.weekNumber).toBe(3);
  });

  it("returns null for a kickoff outside every week", () => {
    expect(findWeekForKickoff(WEEKS, new Date("2026-08-01T17:00:00Z"))).toBeNull();
  });
});
