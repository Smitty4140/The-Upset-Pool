/**
 * Seed the 2026 NFL regular season schedule from ESPN.
 * - Deletes incorrect 2026 weeks (Feb/Mar/Apr placeholder data)
 * - Creates weeks 1-18 with correct dates from ESPN calendar
 * - Fetches all games for each week and inserts them
 * - picks_lock_at = Sunday 1 PM ET of that week (17:00 or 18:00 UTC, DST-aware)
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

// Convert 1 PM Eastern on a given calendar date to UTC, DST-aware.
// Inline copy of server/timezoneUtils.ts easternTimeToUTC (this script can't
// import the TypeScript module).
function easternTimeToUTC(year, month, day, hour, minute = 0) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mi = String(minute).padStart(2, '0');
  const edt = new Date(`${year}-${mm}-${dd}T${hh}:${mi}:00-04:00`);
  const est = new Date(`${year}-${mm}-${dd}T${hh}:${mi}:00-05:00`);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hour12: false,
  });
  if (parseInt(fmt.format(edt)) === hour) return edt;
  if (parseInt(fmt.format(est)) === hour) return est;
  return edt;
}

// Lock at 1 PM ET on the week's game Sunday. Two traps here:
// - The lock Sunday is the LAST Sunday in the week's window, not the first:
//   week 1's ESPN window opens on the Sunday BEFORE kickoff (2026-09-06),
//   while its games are played on 2026-09-13.
// - The EDT/EST offset must come from the actual date, not a hardcoded week
//   boundary: DST ends Nov 1 2026, which is week 8's Sunday, so a
//   "weeks 1-9 are EDT" rule locks weeks 8 and 9 at noon ET.
function getSundayLocksAt(endDate) {
  const sunday = new Date(endDate + 'T00:00:00Z');
  while (sunday.getUTCDay() !== 0) {
    sunday.setUTCDate(sunday.getUTCDate() - 1);
  }
  return easternTimeToUTC(
    sunday.getUTCFullYear(),
    sunday.getUTCMonth() + 1,
    sunday.getUTCDate(),
    13,
    0,
  ).toISOString();
}

async function fetchESPNWeek(weekNum) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&season=2026&week=${weekNum}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN error week ${weekNum}: ${res.status}`);
  const data = await res.json();
  return data.events || [];
}

async function run() {
  const client = await pool.connect();
  try {
    console.log('=== 2026 NFL Schedule Seeder ===\n');

    // Load all teams into a map: lowercase name -> id, also abbreviation -> id
    const teamsRes = await client.query('SELECT id, name, abbreviation FROM nfl_teams');
    const teamByName = new Map();
    const teamByAbbr = new Map();
    for (const t of teamsRes.rows) {
      teamByName.set(t.name.toLowerCase(), t.id);
      teamByAbbr.set(t.abbreviation.toLowerCase(), t.id);
    }

    function findTeamId(espnTeam) {
      const byAbbr = teamByAbbr.get(espnTeam.abbreviation?.toLowerCase());
      if (byAbbr) return byAbbr;
      const byName = teamByName.get(espnTeam.displayName?.toLowerCase());
      if (byName) return byName;
      // Try short name
      const byShort = teamByName.get(espnTeam.shortDisplayName?.toLowerCase());
      if (byShort) return byShort;
      return null;
    }

    // 1. Delete old bogus 2026 weeks (cascades to games and picks)
    console.log('Deleting old 2026 placeholder weeks...');
    const oldWeeks = await client.query('SELECT id FROM nfl_weeks WHERE season = 2026');
    if (oldWeeks.rows.length > 0) {
      const weekIds = oldWeeks.rows.map(r => r.id);
      // Get game IDs for those weeks
      const oldGames = await client.query('SELECT id FROM nfl_games WHERE week_id = ANY($1)', [weekIds]);
      const gameIds = oldGames.rows.map(r => r.id);
      if (gameIds.length > 0) {
        // Delete user_picks referencing those games first
        const picksRes = await client.query('DELETE FROM user_picks WHERE game_id = ANY($1)', [gameIds]);
        console.log(`  Removed ${picksRes.rowCount} test picks on placeholder games.`);
      }
      await client.query('DELETE FROM nfl_games WHERE week_id = ANY($1)', [weekIds]);
      await client.query('DELETE FROM nfl_weeks WHERE id = ANY($1)', [weekIds]);
      console.log(`  Removed ${weekIds.length} old weeks and their games.\n`);
    } else {
      console.log('  No old weeks found.\n');
    }

    let totalWeeks = 0;
    let totalGames = 0;
    let totalErrors = 0;

    // 2. For each ESPN week, create the week row and insert games
    for (const w of ESPN_WEEKS) {
      const picksLockAt = getSundayLocksAt(w.endDate);

      // Insert week
      const weekRes = await client.query(
        `INSERT INTO nfl_weeks (week_number, season, start_date, end_date, active, picks_lock_at)
         VALUES ($1, 2026, $2, $3, false, $4)
         RETURNING id`,
        [w.week, w.startDate, w.endDate, picksLockAt]
      );
      const weekId = weekRes.rows[0].id;
      totalWeeks++;

      console.log(`Week ${String(w.week).padStart(2)} (${w.startDate} → ${w.endDate})  lock: ${new Date(picksLockAt).toUTCString()}`);

      // Fetch games from ESPN
      let events;
      try {
        events = await fetchESPNWeek(w.week);
      } catch (err) {
        console.error(`  ❌ ESPN fetch failed: ${err.message}`);
        totalErrors++;
        continue;
      }

      let weekGames = 0;
      for (const event of events) {
        const comp = event.competitions?.[0];
        if (!comp) continue;
        const competitors = comp.competitors || [];
        const home = competitors.find(c => c.homeAway === 'home');
        const away = competitors.find(c => c.homeAway === 'away');
        if (!home || !away) continue;

        const homeId = findTeamId(home.team);
        const awayId = findTeamId(away.team);

        if (!homeId || !awayId) {
          console.error(`  ⚠️  Unknown team: ${home.team.displayName} vs ${away.team.displayName}`);
          totalErrors++;
          continue;
        }

        const gameTime = new Date(event.date);

        await client.query(
          `INSERT INTO nfl_games (week_id, home_team_id, away_team_id, spread, home_team_record, away_team_record, game_time, completed)
           VALUES ($1, $2, $3, '0', '0-0', '0-0', $4, false)`,
          [weekId, homeId, awayId, gameTime]
        );
        weekGames++;
      }

      console.log(`  ✅ ${weekGames} games inserted\n`);
      totalGames += weekGames;

      // Polite delay between ESPN requests
      await new Promise(r => setTimeout(r, 300));
    }

    console.log('=== Summary ===');
    console.log(`Weeks created: ${totalWeeks}`);
    console.log(`Games inserted: ${totalGames}`);
    console.log(`Errors/warnings: ${totalErrors}`);

    // Verify
    const verify = await client.query(
      'SELECT w.week_number, COUNT(g.id) AS games FROM nfl_weeks w LEFT JOIN nfl_games g ON g.week_id = w.id WHERE w.season = 2026 GROUP BY w.week_number ORDER BY w.week_number'
    );
    console.log('\n2026 Season Summary:');
    for (const row of verify.rows) {
      console.log(`  Week ${String(row.week_number).padStart(2)}: ${row.games} games`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
