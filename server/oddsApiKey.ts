/**
 * Return the configured Odds API credential.
 *
 * ODDS_API_KEY is the canonical Replit secret. THE_ODDS_API_KEY remains
 * supported for older deployments and local environments.
 */
export function getOddsApiKey(): string | undefined {
  return process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY;
}