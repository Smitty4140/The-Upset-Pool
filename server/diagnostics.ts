/**
 * Read-only provider diagnostics.
 *
 * Answers three questions before a season week goes live — are spreads pulling,
 * are results pulling, does email send — WITHOUT touching production data.
 *
 * SAFETY CONTRACT: this module must never write. It does not import the drizzle
 * mutation helpers and never calls `storage.processGameResults`. Everything here
 * fetches, maps, compares, and reports what a real pull *would* do.
 * `server/__tests__/diagnosticsSafety.test.ts` enforces that structurally — if you
 * add a write here, that test fails.
 *
 * It deliberately duplicates the fetch/mapping logic in `nflDataPuller.ts` and
 * `espnResultsPuller.ts` rather than refactoring them, so that a diagnostic can
 * never share a code path with something that writes. The cost is drift: if you
 * change how production maps teams or buckets weeks, change it here too.
 */

import { db } from './db.js';
import { nflGames, userPicks } from '../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import type { IStorage } from './storage.js';
import type { NFLWeek, NFLTeam } from '../shared/schema.js';

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export interface DiagnosticOutcome {
  check: 'spreads' | 'results' | 'email';
  status: 'pass' | 'fail' | 'warn';
  summary: string;
  /** Always true for the two sports checks — stated in the payload so the caller can show it. */
  readOnly: boolean;
}

/** Render a kickoff in Eastern Time, which is how the league thinks about game times. */
function formatET(date: Date): string {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' ET';
}

/** Team lookup by full name, as The Odds API sends it ("Kansas City Chiefs"). */
function buildTeamNameMap(teams: NFLTeam[]): Map<string, NFLTeam> {
  const map = new Map<string, NFLTeam>();
  for (const team of teams) {
    map.set(team.name.toLowerCase(), team);
  }
  return map;
}

/** Team lookup that also accepts abbreviations, matching how the ESPN puller resolves teams. */
function buildEspnTeamMap(teams: NFLTeam[]): Map<string, NFLTeam> {
  const map = buildTeamNameMap(teams);
  for (const team of teams) {
    if (team.abbreviation) map.set(team.abbreviation.toLowerCase(), team);
  }
  return map;
}

// ---------------------------------------------------------------------------
// 1. Spreads — The Odds API
// ---------------------------------------------------------------------------

export interface SpreadsGameReport {
  matchup: string;
  kickoffET: string;
  kickoffUTC: string;
  spread: number | null;
  existsInDb: boolean;
  /** What a real pull would do to this game. */
  wouldDo: 'create' | 'update-spread' | 'leave-alone';
}

export interface SpreadsExclusion {
  matchup: string;
  kickoffET: string;
  reason: 'out-of-week' | 'unmatched-team' | 'no-spreads-market';
  detail: string;
}

export interface SpreadsDiagnostic extends DiagnosticOutcome {
  check: 'spreads';
  week: { id: number; weekNumber: number; season: number; startDate: string; endDate: string } | null;
  http: { ok: boolean; status: number | null; statusText: string | null };
  /** The Odds API bills per request; these headers are the season's runway. */
  quota: { remaining: string | null; used: string | null };
  totalGamesReturned: number;
  gamesInSelectedWeek: SpreadsGameReport[];
  excluded: SpreadsExclusion[];
  wouldCreate: number;
  wouldUpdate: number;
  wouldLeaveAlone: number;
}

/**
 * Fetch spreads exactly as production does and report what a real pull would change.
 * Nothing is written.
 */
export async function diagnoseSpreads(storage: IStorage, weekId: number): Promise<SpreadsDiagnostic> {
  const base: SpreadsDiagnostic = {
    check: 'spreads',
    status: 'fail',
    summary: '',
    readOnly: true,
    week: null,
    http: { ok: false, status: null, statusText: null },
    quota: { remaining: null, used: null },
    totalGamesReturned: 0,
    gamesInSelectedWeek: [],
    excluded: [],
    wouldCreate: 0,
    wouldUpdate: 0,
    wouldLeaveAlone: 0,
  };

  const week = await storage.getNFLWeek(weekId);
  if (!week) {
    return { ...base, summary: `NFL week id ${weekId} not found` };
  }
  base.week = {
    id: week.id,
    weekNumber: week.weekNumber,
    season: week.season,
    startDate: String(week.startDate),
    endDate: String(week.endDate),
  };

  if (!process.env.THE_ODDS_API_KEY) {
    return { ...base, summary: 'THE_ODDS_API_KEY is not set — the spreads pull cannot run at all' };
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?regions=us&markets=spreads&apiKey=${process.env.THE_ODDS_API_KEY}&bookmakers=draftkings`
    );
  } catch (error: any) {
    return { ...base, summary: `Could not reach The Odds API: ${error?.message || error}` };
  }

  base.http = { ok: response.ok, status: response.status, statusText: response.statusText };
  base.quota = {
    remaining: response.headers.get('x-requests-remaining'),
    used: response.headers.get('x-requests-used'),
  };

  if (!response.ok) {
    const hint = response.status === 401
      ? ' (401 usually means the API key is wrong or expired)'
      : response.status === 429
        ? ' (429 means the request quota is exhausted)'
        : '';
    return { ...base, summary: `The Odds API returned ${response.status} ${response.statusText}${hint}` };
  }

  const oddsData: any[] = await response.json();
  base.totalGamesReturned = oddsData.length;

  const allWeeks = await storage.getNFLWeeks();
  const teamNameMap = buildTeamNameMap(await storage.getNFLTeams());
  const existingGames = await db.select().from(nflGames).where(eq(nflGames.weekId, week.id));

  // Same UTC date-string bucketing production uses (nflDataPuller.ts findWeekForGame).
  // Kickoffs are reported in ET alongside it so a human can spot a mis-bucketed
  // Monday night game rather than the diagnostic silently agreeing with the rule.
  const findWeekForGame = (gameTime: Date): NFLWeek | null => {
    const gameDateStr = gameTime.toISOString().split('T')[0];
    for (const w of allWeeks) {
      const startDateStr = new Date(w.startDate).toISOString().split('T')[0];
      const endDateStr = new Date(w.endDate).toISOString().split('T')[0];
      if (gameDateStr >= startDateStr && gameDateStr <= endDateStr) return w;
    }
    return null;
  };

  for (const game of oddsData) {
    const kickoff = new Date(game.commence_time);
    const matchup = `${game.away_team} @ ${game.home_team}`;
    const kickoffET = formatET(kickoff);

    const gameWeek = findWeekForGame(kickoff);
    if (!gameWeek || gameWeek.id !== week.id) {
      // The Odds API returns every upcoming game, so this is the normal case for
      // most rows — reported separately so it never reads as a failure.
      base.excluded.push({
        matchup,
        kickoffET,
        reason: 'out-of-week',
        detail: gameWeek ? `belongs to Week ${gameWeek.weekNumber}` : 'no matching week in the schedule',
      });
      continue;
    }

    const homeTeam = teamNameMap.get(String(game.home_team).toLowerCase());
    const awayTeam = teamNameMap.get(String(game.away_team).toLowerCase());
    if (!homeTeam || !awayTeam) {
      base.excluded.push({
        matchup,
        kickoffET,
        reason: 'unmatched-team',
        detail: `no nfl_teams row named "${!homeTeam ? game.home_team : game.away_team}"`,
      });
      continue;
    }

    const bookmaker = game.bookmakers?.find((b: any) => b.key === 'draftkings') || game.bookmakers?.[0];
    const spreadsMarket = bookmaker?.markets?.find((m: any) => m.key === 'spreads');
    const homeOutcome = spreadsMarket?.outcomes?.find((o: any) => o.name === game.home_team);
    if (!bookmaker || !spreadsMarket || !homeOutcome) {
      base.excluded.push({
        matchup,
        kickoffET,
        reason: 'no-spreads-market',
        detail: !bookmaker ? 'no bookmaker data' : !spreadsMarket ? 'no spreads market' : 'no home-team outcome',
      });
      continue;
    }

    const spread = parseFloat(homeOutcome.point) || 0;
    const existing = existingGames.find(
      g => g.homeTeamId === homeTeam.id && g.awayTeamId === awayTeam.id
    );

    // Production only writes a spread when the stored one is still 0 — once
    // pulled, spreads are frozen (nflDataPuller.ts:155-166).
    let wouldDo: SpreadsGameReport['wouldDo'];
    if (!existing) {
      wouldDo = 'create';
      base.wouldCreate++;
    } else if ((parseFloat(String(existing.spread)) || 0) === 0) {
      wouldDo = 'update-spread';
      base.wouldUpdate++;
    } else {
      wouldDo = 'leave-alone';
      base.wouldLeaveAlone++;
    }

    base.gamesInSelectedWeek.push({
      matchup,
      kickoffET,
      kickoffUTC: kickoff.toISOString(),
      spread,
      existsInDb: Boolean(existing),
      wouldDo,
    });
  }

  const realProblems = base.excluded.filter(e => e.reason !== 'out-of-week');
  const found = base.gamesInSelectedWeek.length;

  if (found === 0) {
    base.status = 'fail';
    base.summary = `Connected, but no games matched Week ${week.weekNumber}. ${base.totalGamesReturned} games returned; check the week's date range.`;
  } else if (realProblems.length > 0) {
    base.status = 'warn';
    base.summary = `${found} games matched Week ${week.weekNumber}, but ${realProblems.length} game(s) could not be processed — see excluded.`;
  } else {
    base.status = 'pass';
    base.summary = `${found} games matched Week ${week.weekNumber} with spreads. ${base.wouldCreate} would be created, ${base.wouldUpdate} updated, ${base.wouldLeaveAlone} left alone.`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// 2. Results — ESPN
// ---------------------------------------------------------------------------

export interface ResultsGameReport {
  matchup: string;
  state: 'completed' | 'in-progress' | 'scheduled';
  score: string | null;
  teamMapping: 'matched-by-name' | 'matched-by-abbreviation' | 'unmatched';
  existsInDb: boolean;
  /** Only populated for completed games that exist in the database. */
  proposedChange: string | null;
  /** Picks that a real pull would recalculate. Counted, never processed. */
  picksAffected: number;
}

export interface ResultsDiagnostic extends DiagnosticOutcome {
  check: 'results';
  week: { id: number; weekNumber: number; season: number } | null;
  espnUrl: string | null;
  http: { ok: boolean; status: number | null; statusText: string | null };
  eventsReturned: number;
  games: ResultsGameReport[];
  unmatchedTeams: string[];
  notInDatabase: string[];
}

/**
 * Fetch ESPN results exactly as production does and report what a real pull would
 * change. No game is updated and no pick is recalculated.
 */
export async function diagnoseResults(storage: IStorage, weekId: number): Promise<ResultsDiagnostic> {
  const base: ResultsDiagnostic = {
    check: 'results',
    status: 'fail',
    summary: '',
    readOnly: true,
    week: null,
    espnUrl: null,
    http: { ok: false, status: null, statusText: null },
    eventsReturned: 0,
    games: [],
    unmatchedTeams: [],
    notInDatabase: [],
  };

  const week = await storage.getNFLWeek(weekId);
  if (!week) {
    return { ...base, summary: `NFL week id ${weekId} not found` };
  }
  base.week = { id: week.id, weekNumber: week.weekNumber, season: week.season };

  // Season comes from the week row, not the calendar — Week 18 of 2026 is January 2027.
  const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${week.season}&seasontype=2&week=${week.weekNumber}`;
  base.espnUrl = espnUrl;

  let response: Response;
  try {
    response = await fetch(espnUrl);
  } catch (error: any) {
    return { ...base, summary: `Could not reach ESPN: ${error?.message || error}` };
  }

  base.http = { ok: response.ok, status: response.status, statusText: response.statusText };
  if (!response.ok) {
    return { ...base, summary: `ESPN returned ${response.status} ${response.statusText}` };
  }

  const espnData = await response.json();
  const events: any[] = espnData.events || [];
  base.eventsReturned = events.length;

  const teams = await storage.getNFLTeams();
  const nameMap = buildTeamNameMap(teams);
  const espnMap = buildEspnTeamMap(teams);
  const existingGames = await db.select().from(nflGames).where(eq(nflGames.weekId, week.id));

  for (const event of events) {
    const competition = event.competitions?.[0];
    const home = competition?.competitors?.find((c: any) => c.homeAway === 'home');
    const away = competition?.competitors?.find((c: any) => c.homeAway === 'away');
    if (!home || !away) continue;

    const homeName = home.team.displayName;
    const awayName = away.team.displayName;
    const matchup = `${awayName} @ ${homeName}`;

    const dbHome = nameMap.get(homeName.toLowerCase()) || espnMap.get(String(home.team.abbreviation).toLowerCase());
    const dbAway = nameMap.get(awayName.toLowerCase()) || espnMap.get(String(away.team.abbreviation).toLowerCase());

    const teamMapping: ResultsGameReport['teamMapping'] = !dbHome || !dbAway
      ? 'unmatched'
      : nameMap.has(homeName.toLowerCase()) && nameMap.has(awayName.toLowerCase())
        ? 'matched-by-name'
        : 'matched-by-abbreviation';

    const status = competition.status?.type;
    const state: ResultsGameReport['state'] = status?.completed
      ? 'completed'
      : status?.state === 'in'
        ? 'in-progress'
        : 'scheduled';

    const score = state === 'scheduled' ? null : `${awayName} ${away.score} - ${home.score} ${homeName}`;

    if (teamMapping === 'unmatched') {
      base.unmatchedTeams.push(!dbHome ? homeName : awayName);
      base.games.push({ matchup, state, score, teamMapping, existsInDb: false, proposedChange: null, picksAffected: 0 });
      continue;
    }

    const existing = existingGames.find(g => g.homeTeamId === dbHome!.id && g.awayTeamId === dbAway!.id);
    if (!existing) base.notInDatabase.push(matchup);

    let proposedChange: string | null = null;
    let picksAffected = 0;
    if (state === 'completed' && existing) {
      const homeScore = parseInt(home.score);
      const awayScore = parseInt(away.score);
      const winner = homeScore > awayScore ? dbHome!.name : dbAway!.name;
      proposedChange = existing.completed
        ? `already recorded ${existing.awayTeamScore}-${existing.homeTeamScore}; would set ${awayScore}-${homeScore}, winner ${winner}`
        : `would set ${awayScore}-${homeScore}, winner ${winner}`;
      // Counted only. processGameResults is never called from this module.
      const picks = await db
        .select({ id: userPicks.id })
        .from(userPicks)
        .where(and(eq(userPicks.gameId, existing.id), eq(userPicks.weekId, week.id)));
      picksAffected = picks.length;
    }

    base.games.push({
      matchup,
      state,
      score,
      teamMapping,
      existsInDb: Boolean(existing),
      proposedChange,
      picksAffected,
    });
  }

  const completed = base.games.filter(g => g.state === 'completed').length;
  const scheduled = base.games.filter(g => g.state === 'scheduled').length;

  if (events.length === 0) {
    base.status = 'fail';
    base.summary = `Connected, but ESPN returned no events for ${week.season} Week ${week.weekNumber}.`;
  } else if (base.unmatchedTeams.length > 0) {
    base.status = 'warn';
    base.summary = `${events.length} events returned, but ${base.unmatchedTeams.length} team name(s) did not match the database: ${Array.from(new Set(base.unmatchedTeams)).join(', ')}.`;
  } else if (completed === 0) {
    // Expected before the week is played — connectivity and mapping are proven, results handling isn't.
    base.status = 'pass';
    base.summary = `${events.length} events returned and every team mapped. No games played yet (${scheduled} scheduled), so this confirms connectivity and team mapping, not results handling.`;
  } else {
    base.status = 'pass';
    base.summary = `${events.length} events returned, every team mapped, ${completed} completed. ${base.games.reduce((n, g) => n + g.picksAffected, 0)} picks would be recalculated.`;
  }
  return base;
}
