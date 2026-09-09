/**
 * When should a week's spreads be pulled, and is this week due right now?
 *
 * Kept free of database and network imports so the rule can be tested
 * directly. The scheduler owns the side effects — reading games, calling The
 * Odds API, mailing the league — and asks this module what to do.
 */

import { SPREAD_PULL_LEAD_MS, hasPostedSpread, spreadsPostAt } from '../shared/spreads.js';

/** Spreads post this long before the week's first kickoff. */
export { SPREAD_PULL_LEAD_MS };

/**
 * Fallback trigger for a week with no games on the board yet.
 *
 * Picks lock Sunday at 1 PM ET and a standard Thursday kickoff is 8:15 PM ET
 * three days earlier, so lock minus 3 days 1 hour lands around Thursday noon
 * ET — the same slot the real "8 hours before kickoff" rule produces. Only
 * reached when the schedule has not been seeded, which is exactly the case
 * that used to make a week unpullable forever: the trigger time was read off
 * the week's games, but the pull is what creates those games.
 */
export const SPREAD_PULL_FALLBACK_BEFORE_LOCK_MS = (3 * 24 + 1) * 60 * 60 * 1000;

/** Minimum gap between Odds API attempts for the same week. */
export const SPREAD_PULL_RETRY_MS = 30 * 60 * 1000;

/**
 * Attempts per week before the scheduler stops and asks for a human. The Odds
 * API bills per request, so a week that cannot be filled — a date range that
 * matches nothing, a book with no lines up — must not retry until the
 * season's quota is gone.
 */
export const MAX_SPREAD_PULL_ATTEMPTS = 12;

export interface SpreadPullWeek {
  id: number;
  weekNumber: number;
  picksLockAt: Date | string;
}

export interface SpreadPullGame {
  gameTime: Date | string;
  spread: unknown;
  updatedAt?: Date | string | null;
}

export interface SpreadPullAttempts {
  count: number;
  lastAttemptAt: number;
}

export type SpreadPullStatus =
  /** Every game already has a spread — nothing to do. */
  | 'complete'
  /** Picks are closed; a "spreads are up" pull would mail a dead board. */
  | 'locked'
  /** The trigger time has not arrived yet. */
  | 'waiting'
  /** Due, but pulled too recently to try again. */
  | 'throttled'
  /** Out of attempts; a human needs to look. */
  | 'exhausted'
  /** Pull now. */
  | 'due';

export interface SpreadPullDecision {
  status: SpreadPullStatus;
  /** The only field the caller acts on; the rest is for logs and the admin page. */
  pull: boolean;
  pullAt: Date;
  total: number;
  missing: number;
}

/** A spread of 0 is how this schema says "not pulled yet". */
export const hasSpread = hasPostedSpread;

/**
 * The moment a week's spreads should post: eight hours before its first
 * kickoff, or the picks-lock fallback when the week has no games yet.
 */
export function spreadPullTime(week: SpreadPullWeek, games: SpreadPullGame[]): Date {
  // The same function the countdown on the league page renders against, so
  // the two cannot drift apart.
  return spreadsPostAt(games)
    ?? new Date(new Date(week.picksLockAt).getTime() - SPREAD_PULL_FALLBACK_BEFORE_LOCK_MS);
}

export function decideSpreadPull(
  week: SpreadPullWeek,
  games: SpreadPullGame[],
  now: number,
  attempts: SpreadPullAttempts = { count: 0, lastAttemptAt: 0 }
): SpreadPullDecision {
  const pullAt = spreadPullTime(week, games);
  const missing = games.filter(game => !hasSpread(game)).length;
  const base = { pullAt, total: games.length, missing };
  const decision = (status: SpreadPullStatus, pull = false): SpreadPullDecision =>
    ({ status, pull, ...base });

  // A week with no games at all is not complete, it is unseeded — and that is
  // the case the fallback trigger exists to rescue.
  if (games.length > 0 && missing === 0) return decision('complete');
  if (now >= new Date(week.picksLockAt).getTime()) return decision('locked');
  if (now < pullAt.getTime()) return decision('waiting');
  if (attempts.count >= MAX_SPREAD_PULL_ATTEMPTS) return decision('exhausted');

  // The in-memory attempt counter is gone after a restart, and on an
  // autoscale deployment that is every few minutes — so the throttle also
  // reads the games themselves. Every row the puller touches gets a fresh
  // updatedAt, which makes "when did this week last see a pull" a fact in the
  // database rather than process state a cold start forgets.
  const lastTouched = games.reduce(
    (latest, game) => Math.max(latest, game.updatedAt ? new Date(game.updatedAt).getTime() : 0),
    0
  );
  if (now - Math.max(attempts.lastAttemptAt, lastTouched) < SPREAD_PULL_RETRY_MS) {
    return decision('throttled');
  }

  return decision('due', true);
}

/**
 * Is a week's "picks are open" email due?
 *
 * Deliberately about the week rather than about the pull: lines can already
 * be in the database when the trigger arrives — an early pull, a manual one —
 * and that week still has to be announced. Three things have to hold: the
 * board is up, picks are still open, and it is time. `pulledFromEmpty` is the
 * exception to the last one, an admin pull that just put the board up being
 * its own reason to tell the league.
 *
 * Whether the league has *already* been told is not decided here — that is
 * the send log's job, and it lives in the database.
 */
export function announcementDue(
  week: SpreadPullWeek,
  games: SpreadPullGame[],
  now: number,
  opts: { pulledFromEmpty: boolean } = { pulledFromEmpty: false }
): boolean {
  if (now >= new Date(week.picksLockAt).getTime()) return false;
  if (!games.some(hasSpread)) return false;
  return opts.pulledFromEmpty || now >= spreadPullTime(week, games).getTime();
}
