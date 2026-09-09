/**
 * When a week's spreads post, and how to tell whether they have.
 *
 * Shared because the server decides when to pull and the client renders a
 * countdown to the same moment — if the two disagree the countdown hits zero
 * either before the pull runs or long after it did.
 */

/** Spreads post this long before a week's first kickoff. */
export const SPREAD_PULL_LEAD_MS = 8 * 60 * 60 * 1000;

/** A spread of 0 is how this schema says "not pulled yet". */
export function hasPostedSpread(game: { spread: unknown }): boolean {
  const value = parseFloat(String(game.spread));
  return Number.isFinite(value) && value !== 0;
}

/**
 * The moment a week's spreads are due, from its games — null when the week has
 * no games on the board, which is not the same thing as "any moment now".
 */
export function spreadsPostAt(games: Array<{ gameTime: string | Date }>): Date | null {
  if (games.length === 0) return null;
  const firstKickoff = games.reduce(
    (earliest, game) => Math.min(earliest, new Date(game.gameTime).getTime()),
    Infinity
  );
  return Number.isFinite(firstKickoff) ? new Date(firstKickoff - SPREAD_PULL_LEAD_MS) : null;
}
