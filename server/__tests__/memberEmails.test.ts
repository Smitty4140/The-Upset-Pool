import { describe, it, expect } from "vitest";
import {
  buildPicksUnlockedEmail,
  buildWeeklyPickReminderEmail,
  pickPageUrl,
} from "../email";
import { formatPicksLockAt, formatPicksLockTimeOnly } from "../timezoneUtils";

// 1:00 PM ET on Sunday, September 7 2025 (EDT, UTC-4)
const LOCK_AT = new Date("2025-09-07T17:00:00Z");
// 1:00 PM ET on Sunday, January 4 2026 (EST, UTC-5)
const WINTER_LOCK_AT = new Date("2026-01-04T18:00:00Z");

describe("pickPageUrl", () => {
  it("deep links to a specific league's pick board", () => {
    const url = pickPageUrl(42);
    expect(url).toContain("tab=spreads");
    expect(url).toContain("league=42");
  });

  it("still lands on the pick board when no league is given", () => {
    expect(pickPageUrl()).toContain("tab=spreads");
    expect(pickPageUrl()).not.toContain("league=");
  });
});

describe("picks lock formatting", () => {
  it("renders the full deadline in Eastern Time", () => {
    expect(formatPicksLockAt(LOCK_AT)).toBe("Sunday, September 7 at 1:00 PM ET");
  });

  it("stays 1:00 PM ET across the DST boundary", () => {
    expect(formatPicksLockTimeOnly(LOCK_AT)).toBe("1:00 PM ET");
    expect(formatPicksLockTimeOnly(WINTER_LOCK_AT)).toBe("1:00 PM ET");
  });

  it("renders a non-standard lock time honestly", () => {
    // Week 18 Saturday slate, say — the copy must not claim Sunday 1:00 PM.
    const saturdayLock = new Date("2026-01-03T21:30:00Z"); // 4:30 PM ET
    expect(formatPicksLockAt(saturdayLock)).toBe("Saturday, January 3 at 4:30 PM ET");
  });
});

describe("picks unlocked email (spreads posted, week is open)", () => {
  const deadline = formatPicksLockAt(LOCK_AT);

  it("links to the selection page for the member's league", () => {
    const mail = buildPicksUnlockedEmail("dana", 3, [{ id: 7, name: "Sunday Dogs" }], deadline);
    const expected = pickPageUrl(7);
    expect(mail.html).toContain(`href="${expected}"`);
    expect(mail.text).toContain(expected);
  });

  it("names the league and week in the subject", () => {
    const mail = buildPicksUnlockedEmail("dana", 3, [{ id: 7, name: "Sunday Dogs" }], deadline);
    expect(mail.subject).toContain("Sunday Dogs");
    expect(mail.subject).toContain("Week 3");
  });

  it("uses the week's real lock deadline rather than a hardcoded one", () => {
    const mail = buildPicksUnlockedEmail("dana", 3, [{ id: 7, name: "Sunday Dogs" }], "Saturday, January 3 at 4:30 PM ET");
    expect(mail.html).toContain("Saturday, January 3 at 4:30 PM ET");
    expect(mail.text).toContain("Saturday, January 3 at 4:30 PM ET");
    expect(mail.html).not.toContain("Picks lock Sunday at 1:00 PM ET");
  });

  it("lists every league for a multi-league member and drops the league-specific link", () => {
    const mail = buildPicksUnlockedEmail(
      "dana",
      3,
      [{ id: 7, name: "Sunday Dogs" }, { id: 9, name: "Office Pool" }],
      deadline
    );
    expect(mail.html).toContain("Sunday Dogs");
    expect(mail.html).toContain("Office Pool");
    // No single league to favor, so the CTA goes to the pick board generally.
    expect(mail.html).toContain(`href="${pickPageUrl()}"`);
  });
});

describe("one-hour warning email (no pick in yet)", () => {
  const lockTime = formatPicksLockTimeOnly(LOCK_AT);

  it("says picks lock in one hour and links to the selection page", () => {
    const mail = buildWeeklyPickReminderEmail("dana", 3, [{ leagueName: "Sunday Dogs", leagueId: 7 }], lockTime);
    expect(mail.subject).toContain("1 hour left");
    expect(mail.html).toContain("Picks Lock in 1 Hour");
    expect(mail.html).toContain(`href="${pickPageUrl(7)}"`);
    expect(mail.text).toContain(pickPageUrl(7));
  });

  it("quotes the week's actual lock time", () => {
    const mail = buildWeeklyPickReminderEmail("dana", 18, [{ leagueName: "Sunday Dogs", leagueId: 7 }], "4:30 PM ET");
    expect(mail.html).toContain("4:30 PM ET");
    expect(mail.text).toContain("Picks lock at 4:30 PM ET");
    expect(mail.text).not.toContain("1:00 PM ET");
  });

  it("gives a member missing picks in several leagues a link per league", () => {
    const mail = buildWeeklyPickReminderEmail(
      "dana",
      3,
      [{ leagueName: "Sunday Dogs", leagueId: 7 }, { leagueName: "Office Pool", leagueId: 9 }],
      lockTime
    );
    expect(mail.html).toContain("You still need picks in 2 leagues");
    expect(mail.html).toContain(`href="${pickPageUrl(7)}"`);
    expect(mail.html).toContain(`href="${pickPageUrl(9)}"`);
    expect(mail.text).toContain(pickPageUrl(7));
    expect(mail.text).toContain(pickPageUrl(9));
  });

  it("never points a member at the bare homepage", () => {
    const mail = buildWeeklyPickReminderEmail("dana", 3, [{ leagueName: "Sunday Dogs", leagueId: 7 }], lockTime);
    // The footer links to the site; the calls to action must not.
    expect(mail.text).toContain("Pick now: https://upsetpool.com/?tab=spreads&league=7");
  });
});
