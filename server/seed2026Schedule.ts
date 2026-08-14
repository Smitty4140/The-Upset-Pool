/**
 * Seed the 2026 NFL regular season schedule from ESPN.
 * Server-side version of scripts/seed-2026-nfl-schedule.mjs so it can be
 * triggered inside the production deployment (the production database is
 * not reachable from the development workspace).
 *
 * - Replaces any existing 2026 weeks/games (placeholder or partial data)
 * - Creates weeks 1-18 with correct dates from the ESPN calendar
 * - Fetches all games for each week and inserts them
 * - picks_lock_at = Sunday 1 PM ET of that week
 *
 * Safety: refuses to run if any user picks exist on 2026 games unless
 * `force` is passed, so real picks are never silently deleted.
 */

import { pool } from './db';

// ESPN regular-season week calendar (from API)
const ESPN_WEEKS = [
  { week: 1,  startDate: '2026-09-06', endDate: '2026-09-15' },
  { week: 2,  startDate: '2026-09-16', endDate: '2026-09-22' },
  { week: 3,  startDate: '2026-09-23', endDate: '2026-09-29' },
  { week: 4,  startDate: '2026-09-30', endDate: '2026-10-06' },
  { week: 5,  startDate: '2026-10-07', endDate: '2026-10-13' },
  { week: 6,  startDate: '2026-10-14', endDate: '2026-10-20' },
  { week: 7,  startDate: '2026-10-21', endDate: '2026-10-27' },
  { week: 8,  startDate: '2026-10-28', endDate: '2026-11-03' },
  { week: 9,  startDate: '2026-11-04', endDate: '2026-11-10' },
  { week: 10, startDate: '2026-11-11', endDate: '2026-11-17' },
  { week: 11, startDate: '2026-11-18', endDate: '2026-11-24' },
  { week: 12, startDate: '2026-11-25', endDate: '2026-12-01' },
  { week: 13, startDate: '2026-12-02', endDate: '2026-12-08' },
  { week: 14, startDate: '2026-12-09', endDate: '2026-12-15' },
  { week: 15, startDate: '2026-12-16', endDate: '2026-12-22' },
  { week: 16, startDate: '2026-12-23', endDate: '2026-12-29' },
  { week: 17, startDate: '2026-12-30', endDate: '2027-01-05' },
  { week: 18, startDate: '2027-01-06', endDate: '2027-01-12' },
];

// Sunday 1 PM ET = 17:00 UTC (EDT, weeks 1-9) or 18:00 UTC (EST, weeks 10-18)
function getSundayLocksAt(startDate: string, weekNum: number): string {
  const start = new Date(startDate + 'T00:00:00Z');
  const sunday = new Date(start);
  while (sunday.getUTCDay() !== 0) {
    sunday.setUTCDate(sunday.getUTCDate() + 1);
  }
  const offsetHours = weekNum <= 9 ? 4 : 5;
  sunday.setUTCHours(13 + offsetHours, 0, 0, 0);
  return sunday.toISOString();
}

async function fetchESPNWeek(weekNum: number): Promise<any[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&season=2026&week=${weekNum}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN error week ${weekNum}: ${res.status}`);
  const data = await res.json();
  return data.events || [];
}

export interface Seed2026Result {
  weeksCreated: number;
  gamesInserted: number;
  errors: number;
  removedWeeks: number;
  removedPicks: number;
  perWeek: { week: number; games: number }[];
}

export async function seedNFL2026Schedule(force = false): Promise<Seed2026Result> {
  const client = await pool.connect();
  try {
    console.log('[Seed2026] Starting 2026 NFL schedule seed...');

    // Safety guard: never silently delete real user picks
    const existingPicks = await client.query(
      `SELECT COUNT(*)::int AS n FROM user_picks up
       JOIN nfl_games g ON g.id::text = up.game_id::text
       JOIN nfl_weeks w ON w.id = g.week_id
       WHERE w.season = 2026`
    );
    const pickCount = existingPicks.rows[0].n as number;
    if (pickCount > 0 && !force) {
      throw new Error(
        `Refusing to reseed: ${pickCount} user pick(s) exist on 2026 games. Pass force=true to override.`
      );
    }

    // Load team lookup maps
    const teamsRes = await client.query('SELECT id, name, abbreviation FROM nfl_teams');
    const teamByName = new Map<string, number>();
    const teamByAbbr = new Map<string, number>();
    for (const t of teamsRes.rows) {
      teamByName.set(t.name.toLowerCase(), t.id);
      teamByAbbr.set(t.abbreviation.toLowerCase(), t.id);
    }
    const findTeamId = (espnTeam: any): number | null =>
      teamByAbbr.get(espnTeam.abbreviation?.toLowerCase()) ??
      teamByName.get(espnTeam.displayName?.toLowerCase()) ??
      teamByName.get(espnTeam.shortDisplayName?.toLowerCase()) ??
      null;

    // Remove any existing 2026 weeks/games (and their picks, guarded above)
    let removedWeeks = 0;
    let removedPicks = 0;
    const oldWeeks = await client.query('SELECT id FROM nfl_weeks WHERE season = 2026');
    if (oldWeeks.rows.length > 0) {
      const weekIds = oldWeeks.rows.map((r: any) => r.id);
      const oldGames = await client.query('SELECT id FROM nfl_games WHERE week_id = ANY($1)', [weekIds]);
      const gameIds = oldGames.rows.map((r: any) => r.id);
      if (gameIds.length > 0) {
        const picksRes = await client.query('DELETE FROM user_picks WHERE game_id = ANY($1)', [gameIds]);
        removedPicks = picksRes.rowCount ?? 0;
      }
      await client.query('DELETE FROM nfl_games WHERE week_id = ANY($1)', [weekIds]);
      await client.query('DELETE FROM nfl_weeks WHERE id = ANY($1)', [weekIds]);
      removedWeeks = weekIds.length;
      console.log(`[Seed2026] Removed ${removedWeeks} existing 2026 weeks (${removedPicks} picks).`);
    }

    let weeksCreated = 0;
    let gamesInserted = 0;
    let errors = 0;
    const perWeek: { week: number; games: number }[] = [];

    for (const w of ESPN_WEEKS) {
      const picksLockAt = getSundayLocksAt(w.startDate, w.week);
      const weekRes = await client.query(
        `INSERT INTO nfl_weeks (week_number, season, start_date, end_date, active, picks_lock_at)
         VALUES ($1, 2026, $2, $3, false, $4)
         RETURNING id`,
        [w.week, w.startDate, w.endDate, picksLockAt]
      );
      const weekId = weekRes.rows[0].id;
      weeksCreated++;

      let events: any[];
      try {
        events = await fetchESPNWeek(w.week);
      } catch (err: any) {
        console.error(`[Seed2026] ESPN fetch failed for week ${w.week}: ${err.message}`);
        errors++;
        perWeek.push({ week: w.week, games: 0 });
        continue;
      }

      let weekGames = 0;
      for (const event of events) {
        const comp = event.competitions?.[0];
        if (!comp) continue;
        const competitors = comp.competitors || [];
        const home = competitors.find((c: any) => c.homeAway === 'home');
        const away = competitors.find((c: any) => c.homeAway === 'away');
        if (!home || !away) continue;

        const homeId = findTeamId(home.team);
        const awayId = findTeamId(away.team);
        if (!homeId || !awayId) {
          console.error(`[Seed2026] Unknown team: ${home.team.displayName} vs ${away.team.displayName}`);
          errors++;
          continue;
        }

        await client.query(
          `INSERT INTO nfl_games (week_id, home_team_id, away_team_id, spread, home_team_record, away_team_record, game_time, completed)
           VALUES ($1, $2, $3, '0', '0-0', '0-0', $4, false)`,
          [weekId, homeId, awayId, new Date(event.date)]
        );
        weekGames++;
      }

      perWeek.push({ week: w.week, games: weekGames });
      gamesInserted += weekGames;
      console.log(`[Seed2026] Week ${w.week}: ${weekGames} games`);

      // Polite delay between ESPN requests
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`[Seed2026] Done: ${weeksCreated} weeks, ${gamesInserted} games, ${errors} errors.`);
    return { weeksCreated, gamesInserted, errors, removedWeeks, removedPicks, perWeek };
  } finally {
    client.release();
  }
}
