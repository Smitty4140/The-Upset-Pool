import { db } from './db.js';
import { golfTournaments, golfPlayers, golfTournamentField, golfResults } from '../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import type { IStorage } from './storage.js';

/**
 * Convert decimal odds to American integer odds.
 * e.g. 5.0 → 400 (+400), 9.5 → 850 (+850), 1.5 → -200
 */
function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  } else {
    return Math.round(-100 / (decimal - 1));
  }
}

/** Normalise a player name for fuzzy matching: lowercase, trim extra whitespace */
function normaliseName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Pull tournament field + odds from The Odds API.
 * Upserts golf_players (by normalised name) and golf_tournament_field (odds column).
 * Does NOT overwrite owgrAtLock.
 */
export async function pullGolfFieldFromOddsAPI(tournamentId: number, storage: IStorage) {
  console.log(`[GolfDataPuller] Starting field pull for tournament ${tournamentId}...`);

  const tournament = await storage.getGolfTournament(tournamentId);
  if (!tournament) throw new Error(`Tournament ${tournamentId} not found`);
  if (!tournament.oddsApiSportKey) throw new Error('Tournament has no oddsApiSportKey configured');

  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) throw new Error('THE_ODDS_API_KEY is not configured');

  const url = `https://api.the-odds-api.com/v4/sports/${tournament.oddsApiSportKey}/odds?regions=us&markets=outrights&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API error: ${res.status} ${res.statusText}`);

  const data: any[] = await res.json();
  if (!data.length) throw new Error('No events returned from Odds API');

  // Use the first event (the tournament outright market)
  const event = data[0];
  const bookmaker = event.bookmakers?.[0];
  if (!bookmaker) throw new Error('No bookmaker data in Odds API response');

  const outcomes: { name: string; price: number }[] =
    bookmaker.markets?.[0]?.outcomes ?? [];

  console.log(`[GolfDataPuller] ${outcomes.length} players from Odds API for "${tournament.name}"`);

  const results = { playersUpserted: 0, errors: 0 };

  for (const outcome of outcomes) {
    try {
      const normName = normaliseName(outcome.name);
      const americanOdds = decimalToAmerican(outcome.price);

      // Find existing player by normalised name
      const allPlayers = await db.select().from(golfPlayers);
      const existing = allPlayers.find(p => normaliseName(p.name) === normName);

      let playerId: number;
      if (existing) {
        playerId = existing.id;
      } else {
        const [newPlayer] = await db.insert(golfPlayers)
          .values({ name: outcome.name })
          .returning();
        playerId = newPlayer.id;
        console.log(`[GolfDataPuller] Created player: ${outcome.name}`);
      }

      // Upsert field entry — only update odds, preserve owgrAtLock
      await db.insert(golfTournamentField)
        .values({ tournamentId, playerId, odds: americanOdds, owgrAtLock: null })
        .onConflictDoUpdate({
          target: [golfTournamentField.tournamentId, golfTournamentField.playerId],
          set: { odds: americanOdds },
        });

      results.playersUpserted++;
    } catch (err) {
      console.error(`[GolfDataPuller] Error processing player ${outcome.name}:`, err);
      results.errors++;
    }
  }

  // Update lastPollAt on the tournament
  await db.update(golfTournaments)
    .set({ updatedAt: new Date() })
    .where(eq(golfTournaments.id, tournamentId));

  console.log(`[GolfDataPuller] ✅ Field pull complete:`, results);
  return { success: true, results };
}

/**
 * Enrich the tournament field with ESPN headshot photos.
 * Queries the ESPN scoreboard for the event, matches players by normalised name,
 * and updates golf_players.photo_url with the ESPN headshot CDN URL.
 */
export async function enrichGolfFieldWithESPNPhotos(tournamentId: number, storage: IStorage): Promise<{ updated: number; skipped: number }> {
  console.log(`[GolfDataPuller] Starting ESPN photo enrichment for tournament ${tournamentId}...`);

  const tournament = await storage.getGolfTournament(tournamentId);
  if (!tournament) throw new Error(`Tournament ${tournamentId} not found`);
  if (!tournament.espnEventId) throw new Error('Tournament has no espnEventId configured — cannot enrich photos');

  const url = `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${tournament.espnEventId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN API error: ${res.status} ${res.statusText}`);

  const data: any = await res.json();
  const espnEvent = data.events?.[0];
  if (!espnEvent) throw new Error('No events returned from ESPN scoreboard');

  const competition = espnEvent.competitions?.[0];
  const competitors: any[] = competition?.competitors ?? [];
  console.log(`[GolfDataPuller] ESPN returned ${competitors.length} competitors for photo enrichment`);

  // Build normalised name → competitor.id from ESPN response
  const espnIdMap = new Map<string, string>();
  for (const competitor of competitors) {
    const displayName: string = competitor.athlete?.displayName ?? '';
    const competitorId: string = competitor.id ?? '';
    if (displayName && competitorId) {
      espnIdMap.set(normaliseName(displayName), competitorId);
    }
  }

  const field = await storage.getGolfTournamentField(tournamentId);
  let updated = 0;
  let skipped = 0;

  for (const entry of field) {
    const espnId = espnIdMap.get(normaliseName(entry.name));
    if (!espnId) {
      skipped++;
      continue;
    }
    const photoUrl = `https://a.espncdn.com/i/headshots/golf/players/full/${espnId}.png`;
    await db.update(golfPlayers)
      .set({ photoUrl })
      .where(eq(golfPlayers.id, entry.playerId));
    updated++;
  }

  console.log(`[GolfDataPuller] ✅ ESPN photo enrichment complete — updated: ${updated}, skipped: ${skipped}`);
  return { updated, skipped };
}

/**
 * Enrich the tournament field with OWGR rankings from DataGolf's free API.
 * Requires DATAGOLF_API_KEY env var — skips gracefully if not set.
 * Updates golf_tournament_field.owgr_at_lock for matched players.
 */
export async function enrichGolfFieldWithDataGolfOWGR(tournamentId: number, storage: IStorage): Promise<{ updated: number; skipped: number }> {
  console.log(`[GolfDataPuller] Starting DataGolf OWGR enrichment for tournament ${tournamentId}...`);

  const apiKey = process.env.DATAGOLF_API_KEY;
  if (!apiKey) {
    console.warn('[GolfDataPuller] DATAGOLF_API_KEY not set — skipping OWGR enrichment');
    return { updated: 0, skipped: 0 };
  }

  const url = `https://feeds.datagolf.com/field-updates?tour=pga&file_format=json&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DataGolf API error: ${res.status} ${res.statusText}`);

  const data: any = await res.json();
  const dgPlayers: any[] = data.field ?? [];
  console.log(`[GolfDataPuller] DataGolf returned ${dgPlayers.length} players for OWGR enrichment`);

  // Build normalised name → OWGR rank from DataGolf
  const owgrMap = new Map<string, number>();
  for (const p of dgPlayers) {
    const name: string = p.player_name ?? '';
    const owgr: number | null = p.owgr ?? null;
    if (name && owgr !== null) {
      owgrMap.set(normaliseName(name), owgr);
    }
  }

  const field = await storage.getGolfTournamentField(tournamentId);
  let updated = 0;
  let skipped = 0;

  for (const entry of field) {
    const owgr = owgrMap.get(normaliseName(entry.name));
    if (owgr === undefined) {
      skipped++;
      continue;
    }
    await db.update(golfTournamentField)
      .set({ owgrAtLock: owgr })
      .where(and(
        eq(golfTournamentField.tournamentId, tournamentId),
        eq(golfTournamentField.playerId, entry.playerId)
      ));
    updated++;
  }

  console.log(`[GolfDataPuller] ✅ DataGolf OWGR enrichment complete — updated: ${updated}, skipped: ${skipped}`);
  return { updated, skipped };
}

/**
 * Pull live / final scores from ESPN's unofficial scoreboard API.
 * Upserts golf_results for matched players.
 * Returns { espnState, matched, skipped, total }.
 *
 * ESPN status.type.state values:
 *   'pre'  → tournament hasn't started
 *   'in'   → in progress (live)
 *   'post' → completed
 */
export async function pullGolfScoresFromESPN(tournamentId: number, storage: IStorage): Promise<{
  espnState: string;
  matched: number;
  skipped: number;
  total: number;
}> {
  console.log(`[GolfDataPuller] Starting ESPN scores pull for tournament ${tournamentId}...`);

  const tournament = await storage.getGolfTournament(tournamentId);
  if (!tournament) throw new Error(`Tournament ${tournamentId} not found`);
  if (!tournament.espnEventId) throw new Error('Tournament has no espnEventId configured');

  const url = `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${tournament.espnEventId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN API error: ${res.status} ${res.statusText}`);

  const data: any = await res.json();
  const espnEvent = data.events?.[0];
  if (!espnEvent) throw new Error('No events returned from ESPN');

  const competition = espnEvent.competitions?.[0];
  const espnState: string = competition?.status?.type?.state ?? 'pre';
  const competitors: any[] = competition?.competitors ?? [];

  console.log(`[GolfDataPuller] ESPN state: ${espnState}, competitors: ${competitors.length}`);

  // Determine expected rounds from the leader (longest linescore = completed rounds)
  const maxRounds = Math.max(...competitors.map((c: any) => c.linescores?.length ?? 0), 0);

  // Load all players in this tournament field for name matching
  const field = await storage.getGolfTournamentField(tournamentId);
  const playersByNormName = new Map<string, number>();
  for (const entry of field) {
    playersByNormName.set(normaliseName(entry.name), entry.playerId);
  }

  const resultsToUpsert: { playerId: number; finalPosition: number | null; status: string; scoreToPar: number | null }[] = [];
  let matched = 0;
  let skipped = 0;

  for (const competitor of competitors) {
    const displayName: string = competitor.athlete?.displayName ?? '';
    const normName = normaliseName(displayName);
    const playerId = playersByNormName.get(normName);

    if (!playerId) {
      console.log(`[GolfDataPuller] No match for ESPN player: "${displayName}"`);
      skipped++;
      continue;
    }

    const finalPosition: number = competitor.order ?? null;
    const roundsPlayed: number = competitor.linescores?.length ?? 0;

    let status: string;
    if (espnState === 'in') {
      status = 'in_progress';
    } else if (roundsPlayed < maxRounds) {
      status = 'mc'; // missed cut
    } else {
      status = 'finished';
    }

    // Extract score-to-par: ESPN provides this as competitor.score or competitor.statistics
    // Try competitor.score.value first (cumulative score), then linescores sum
    let scoreToPar: number | null = null;
    const scoreValue = competitor.score?.value;
    if (scoreValue !== undefined && scoreValue !== null && scoreValue !== '') {
      const parsed = parseInt(String(scoreValue), 10);
      if (!isNaN(parsed)) {
        scoreToPar = parsed;
      }
    }
    // Fallback: sum up linescore values
    if (scoreToPar === null && competitor.linescores && competitor.linescores.length > 0) {
      let total = 0;
      let hasScore = false;
      for (const ls of competitor.linescores) {
        const v = ls.value;
        if (v !== undefined && v !== null && v !== '' && !isNaN(Number(v))) {
          total += Number(v);
          hasScore = true;
        }
      }
      if (hasScore) scoreToPar = total;
    }

    resultsToUpsert.push({ playerId, finalPosition, status, scoreToPar });
    matched++;
  }

  if (resultsToUpsert.length > 0) {
    await storage.upsertGolfResults(tournamentId, resultsToUpsert);
  }

  // Update lastPollAt
  await db.update(golfTournaments)
    .set({ lastPollAt: new Date(), updatedAt: new Date() })
    .where(eq(golfTournaments.id, tournamentId));

  console.log(`[GolfDataPuller] ✅ ESPN pull complete — state: ${espnState}, matched: ${matched}, skipped: ${skipped}`);
  return { espnState, matched, skipped, total: competitors.length };
}
