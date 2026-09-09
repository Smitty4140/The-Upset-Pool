import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SCHEDULER = readFileSync(resolve(import.meta.dirname, "../scheduler.ts"), "utf8");
const ROUTES = readFileSync(resolve(import.meta.dirname, "../routes.ts"), "utf8");

function bodyBetween(src: string, start: string, end: string) {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + 1);
  expect(from, `could not find ${start}`).toBeGreaterThan(-1);
  expect(to, `could not find ${end}`).toBeGreaterThan(from);
  return src.slice(from, to);
}

/**
 * These read the source rather than the behavior because the scheduler cannot
 * be imported without a live database, and the two properties below are the
 * ones whose absence caused real incidents. The rule they enforce is unit
 * tested in spreadPullPolicy.test.ts; what is checked here is that the
 * scheduler is actually wired to it.
 */
describe("spreads pull on a sweep, not a one-shot job", () => {
  it("a recurring cron drives the spread pull", () => {
    // A cron armed for the trigger minute only fires if this exact container
    // is still alive then, which on an autoscale deployment it usually is not.
    expect(SCHEDULER).toMatch(/cron\.schedule\('\*\/10 \* \* \* \*'/);
    expect(bodyBetween(SCHEDULER, "start() {", "stop() {")).toMatch(/sweepSpreadPulls/);
  });

  it("the sweep also runs on startup, so a cold start catches up", () => {
    const start = bodyBetween(SCHEDULER, "start() {", "stop() {");
    expect(start).toMatch(/Also run immediately on startup[\s\S]*sweepSpreadPulls\(\)/);
  });

  it("a week with no games is not skipped", () => {
    // The deadlock that stranded the board on 'Any moment now': the trigger
    // time was read off the week's games, but the pull is what creates them.
    const fn = bodyBetween(SCHEDULER, "private async pullSpreadsIfDue", "private async scheduleWeekResultsPull");
    expect(fn).not.toMatch(/games\.length === 0/);
    expect(fn).toMatch(/decideSpreadPull/);
  });

  it("the pull is scoped to one week", () => {
    const fn = bodyBetween(SCHEDULER, "private async executeDataPull", "private async countSpreads");
    expect(fn).toMatch(/pullNFLGamesFromOddsAPI\(this\.storage, week\.id\)/);
  });
});

describe("the picks-unlocked email fires once, when the board goes up", () => {
  const announce = () =>
    bodyBetween(SCHEDULER, "async announcePicksUnlockedIfDue", "Execute hourly results pull");

  it("the pull itself sends nothing", () => {
    // The email used to be a side effect of the pull, so a week that needed
    // no pull got no email, and every re-pull was a chance to send twice.
    const fn = bodyBetween(SCHEDULER, "private async executeDataPull", "private async countSpreads");
    expect(fn).not.toMatch(/sendPicksUnlockedNotifications/);
  });

  it("the sweep asks about announcing on every tick, not only after a pull", () => {
    const fn = bodyBetween(SCHEDULER, "private async sweepSpreadPulls", "checkAndScheduleResultsPulls");
    expect(fn).toMatch(/announcePicksUnlockedIfDue\(week, \{ pulledFromEmpty \}\)/);
    // Not gated on this tick having pulled — only on a board existing.
    expect(fn).toMatch(/if \(boardIsUp\)/);
  });

  it("a week already announced in this process is not asked about again", () => {
    expect(announce()).toMatch(/if \(this\.announcedWeeks\.has\(week\.id\)\) return null;/);
  });

  it("the send log decides whether the league has already been told", () => {
    const fn = announce();
    expect(fn).toMatch(/alreadyNotified\(EMAIL_KIND_PICKS_UNLOCKED, week\.id\)/);
    // And when that log cannot be read, only a pull that just put the board
    // up may announce — a duplicate is worse than a late one.
    expect(fn).toMatch(/if \(!this\.notificationLogAvailable && !opts\.pulledFromEmpty\)/);
  });

  it("a week announced by hand is held, before any other check", () => {
    const fn = announce();
    expect(fn).toMatch(/if \(announcedOutOfBand\(week\)\)/);
    // Ahead of the send-log read, which has no rows for such a week.
    expect(fn.indexOf("announcedOutOfBand")).toBeLessThan(fn.indexOf("alreadyNotified"));
  });

  it("a failed send is retried rather than marked done", () => {
    expect(announce()).toMatch(/if \(outcome\.emailsFailed === 0\) this\.announcedWeeks\.add\(week\.id\)/);
  });

  it("the admin pull button goes through the same gate, scoped to one week", () => {
    const fn = bodyBetween(ROUTES, "'/api/admin/pull-games'", "// NFL Odds Games route");
    expect(fn).toMatch(/pullNFLGamesFromOddsAPI\(storage, currentWeek\.id\)/);
    expect(fn).toMatch(/announcePicksUnlockedIfDue\(currentWeek/);
    expect(fn).not.toMatch(/sendPicksUnlockedNotifications/);
  });

  it("the manual pull actually pulls", () => {
    // It used to return { success: true, gamesUpdated: 0 } without calling
    // anything, so the button reported green while the board stayed empty.
    const fn = bodyBetween(SCHEDULER, "async triggerManualPull", "\n  }\n\n}");
    expect(fn).toMatch(/await this\.executeDataPull\(week\)/);
    expect(fn).not.toMatch(/would pull game data in production/);
  });
});
