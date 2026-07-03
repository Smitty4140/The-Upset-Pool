import { db } from './db.js';
import { golfTournaments } from '../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import type { IStorage } from './storage.js';
import type { GolfTournament } from '../shared/schema.js';

/**
 * Auto-seeds golf major championships from the ESPN season calendar.
 *
 * Only the four men's majors are seeded because The Odds API (our odds
 * provider) only carries outright-winner odds for these events. Each entry
 * maps exact ESPN calendar labels to the corresponding Odds API sport key.
 */
const MAJORS: { espnLabels: string[]; oddsApiSportKey: string }[] = [
  { espnLabels: ['masters tournament', 'the masters'], oddsApiSportKey: 'golf_masters_tournament_winner' },
  { espnLabels: ['pga championship'], oddsApiSportKey: 'golf_pga_championship_winner' },
  { espnLabels: ['u.s. open', 'us open'], oddsApiSportKey: 'golf_us_open_winner' },
  { espnLabels: ['the open', 'the open championship'], oddsApiSportKey: 'golf_the_open_championship_winner' },
];

function matchMajorOddsKey(label: string): string | null {
  const norm = label.trim().toLowerCase();
  for (const m of MAJORS) {
    if (m.espnLabels.includes(norm)) return m.oddsApiSportKey;
  }
  return null;
}

/**
 * Fetch the ESPN PGA calendar for the current and next year, find majors
 * that have not started yet, and create tournament rows for any that don't
 * already exist. Existing rows are matched by ESPN event ID first, then by
 * (odds key, season) so manually created tournaments are never duplicated.
 *
 * picksLockAt defaults to the tournament start time from ESPN; a super user
 * can adjust it afterwards via PATCH /api/golf/tournaments/:id.
 *
 * Returns the newly created tournaments (empty array if nothing to do).
 */
export async function seedUpcomingMajors(storage: IStorage): Promise<GolfTournament[]> {
  const created: GolfTournament[] = [];
  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() + 1];

  for (const year of years) {
    let data: any;
    try {
      const resp = await fetch(`https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${year}`);
      if (!resp.ok) {
        console.warn(`[MajorsSeeder] ESPN calendar for ${year} returned ${resp.status}`);
        continue;
      }
      data = await resp.json();
    } catch (err) {
      console.error(`[MajorsSeeder] ESPN calendar fetch failed for ${year}:`, err);
      continue;
    }

    const calendar: any[] = data?.leagues?.[0]?.calendar || [];
    for (const evt of calendar) {
      const label: string = evt?.label || '';
      // Calendar entries carry the event ID inside event.$ref
      // (e.g. ".../pga/events/401811957?lang=en"), not as a top-level id.
      const refMatch = typeof evt?.event?.$ref === 'string' ? evt.event.$ref.match(/\/events\/(\d+)/) : null;
      const espnEventId: string = refMatch?.[1] || evt?.id || '';
      const startDate = evt?.startDate ? new Date(evt.startDate) : null;

      const oddsApiSportKey = matchMajorOddsKey(label);
      if (!oddsApiSportKey || !espnEventId || !startDate || isNaN(startDate.getTime())) continue;
      if (startDate <= now) continue; // past majors can't host a new league

      try {
        const byEspnId = await db
          .select()
          .from(golfTournaments)
          .where(eq(golfTournaments.espnEventId, espnEventId));
        if (byEspnId.length > 0) continue;

        const byKeyAndSeason = await db
          .select()
          .from(golfTournaments)
          .where(and(
            eq(golfTournaments.oddsApiSportKey, oddsApiSportKey),
            eq(golfTournaments.season, year),
          ));
        if (byKeyAndSeason.length > 0) continue;

        const tournament = await storage.createGolfTournament({
          name: label.trim(),
          location: null,
          season: year,
          startsAt: startDate,
          picksLockAt: startDate,
          status: 'upcoming',
          picksRequired: 4,
          oddsApiSportKey,
          espnEventId,
        });
        console.log(`[MajorsSeeder] Created "${tournament.name}" (${year}), starts ${startDate.toISOString()}`);
        created.push(tournament);
      } catch (err) {
        console.error(`[MajorsSeeder] Failed to seed "${label}" (${year}):`, err);
      }
    }
  }

  return created;
}
