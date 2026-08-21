/**
 * Audit and repair picks_lock_at for stored NFL weeks.
 *
 * The rule: picks lock at 1:00 PM Eastern on each week's game Sunday,
 * DST-aware (17:00 UTC under EDT, 18:00 UTC under EST). Earlier seeders got
 * this wrong in two ways — a hardcoded "weeks 1-9 are EDT" boundary (DST ends
 * Nov 1 2026, week 8's Sunday) and a first-Sunday scan that lands a week
 * early for week 1, whose ESPN window opens on the Sunday before kickoff.
 *
 * This module recomputes the correct lock for every stored regular-season
 * week and reports drift; with apply=true it also writes the corrections.
 * The game Sunday is derived from the week's actual games when they exist
 * (the earliest kickoff that falls on a Sunday in Eastern Time), falling
 * back to the last Sunday in the week's date window.
 */

import { pool } from './db';
import { easternTimeToUTC } from './timezoneUtils';

const ET_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const ET_DOW_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
});

export interface LockTimeWeekReport {
  season: number;
  week: number;
  source: 'games' | 'calendar';
  stored: string;
  correct: string;
  status: 'ok' | 'needs-fix' | 'fixed';
}

export interface LockTimeRepairResult {
  apply: boolean;
  weeksChecked: number;
  weeksNeedingFix: number;
  report: LockTimeWeekReport[];
}

function correctLockTime(
  endDate: string,
  gameTimes: Date[],
): { lock: Date; source: 'games' | 'calendar' } {
  // Prefer the actual slate: earliest kickoff on an Eastern-Time Sunday.
  const sundayKickoffs = gameTimes
    .filter((t) => ET_DOW_FMT.format(t) === 'Sun')
    .sort((a, b) => a.getTime() - b.getTime());
  if (sundayKickoffs.length > 0) {
    const [y, m, d] = ET_DATE_FMT.format(sundayKickoffs[0]).split('-').map(Number);
    return { lock: easternTimeToUTC(y, m, d, 13, 0), source: 'games' };
  }

  // No Sunday games stored (e.g. schedule not pulled yet): last Sunday in the
  // week's window, scanned in UTC — date-only strings have a fixed weekday.
  const sunday = new Date(String(endDate).slice(0, 10) + 'T00:00:00Z');
  while (sunday.getUTCDay() !== 0) {
    sunday.setUTCDate(sunday.getUTCDate() - 1);
  }
  return {
    lock: easternTimeToUTC(
      sunday.getUTCFullYear(),
      sunday.getUTCMonth() + 1,
      sunday.getUTCDate(),
      13,
      0,
    ),
    source: 'calendar',
  };
}

export async function recomputeNFLLockTimes(apply: boolean): Promise<LockTimeRepairResult> {
  const client = await pool.connect();
  try {
    // Regular-season weeks only; preseason placeholders don't follow the
    // Sunday-1-PM rule.
    const weeksRes = await client.query(
      `SELECT id, season, week_number, end_date, picks_lock_at
       FROM nfl_weeks
       WHERE week_number BETWEEN 1 AND 18
       ORDER BY season, week_number`,
    );

    const report: LockTimeWeekReport[] = [];
    let weeksNeedingFix = 0;

    for (const w of weeksRes.rows) {
      const gamesRes = await client.query(
        'SELECT game_time FROM nfl_games WHERE week_id = $1',
        [w.id],
      );
      const gameTimes: Date[] = gamesRes.rows.map((r: any) => new Date(r.game_time));

      const { lock, source } = correctLockTime(w.end_date, gameTimes);
      const stored = new Date(w.picks_lock_at);
      const needsFix = stored.getTime() !== lock.getTime();

      if (needsFix) {
        weeksNeedingFix++;
        if (apply) {
          await client.query(
            'UPDATE nfl_weeks SET picks_lock_at = $1, updated_at = NOW() WHERE id = $2',
            [lock, w.id],
          );
        }
      }

      report.push({
        season: w.season,
        week: w.week_number,
        source,
        stored: stored.toISOString(),
        correct: lock.toISOString(),
        status: needsFix ? (apply ? 'fixed' : 'needs-fix') : 'ok',
      });
    }

    return { apply, weeksChecked: report.length, weeksNeedingFix, report };
  } finally {
    client.release();
  }
}
