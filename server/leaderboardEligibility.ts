// Which weeks a league's leaderboard is measured against.
//
// `nfl_weeks` holds every week of every season, so anything that asks it for
// "the weeks that have locked" without naming a season gets the whole history
// back. That is wrong for a league, which only ever plays one season: it makes
// the "picked every week" streak unreachable (a 2026 league would be asked to
// have picked 2025's eighteen weeks too) and points "last pick" at the highest
// week number across all seasons — a week that league never played, so the
// lookup finds nothing and the column renders empty.

export type EligibilityWeek = {
  id: number;
  season: number;
  weekNumber: number;
  picksLockAt: Date | string;
};

const lockTime = (week: EligibilityWeek): number =>
  (week.picksLockAt instanceof Date ? week.picksLockAt : new Date(week.picksLockAt)).getTime();

/**
 * The weeks of `season` whose picks have already locked, oldest first.
 *
 * These are the weeks a member must have picked to keep an every-week streak,
 * and the last of them is the most recent week whose picks are public — the
 * one "Last Pick" reports on.
 *
 * A null season means the league predates the season column; rather than
 * inventing an answer for it, fall back to every season, which is how this
 * has always behaved.
 */
export function lockedWeeksForSeason<T extends EligibilityWeek>(
  weeks: T[],
  season: number | null | undefined,
  now: Date,
): T[] {
  const cutoff = now.getTime();
  return weeks
    .filter((week) => (season == null || week.season === season) && lockTime(week) < cutoff)
    .sort((a, b) => a.weekNumber - b.weekNumber);
}
