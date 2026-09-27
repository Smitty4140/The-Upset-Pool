/**
 * Who may call the external tick (POST /api/cron/tick).
 *
 * The tick exists because the app runs on autoscale: with no traffic the
 * instance is stopped, and a stopped process fires no cron. An outside
 * scheduler calling in every few minutes is what keeps the Thursday
 * "picks are open" email and the Sunday one-hour warning on time. The caller
 * is a machine, not a signed-in user, so it proves itself with a shared
 * secret (CRON_SECRET) instead of a session.
 *
 * Kept free of Express and database imports so it can be tested directly.
 */

import { timingSafeEqual } from 'crypto';

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: string };

/**
 * The secret can arrive as `Authorization: Bearer <secret>`, as an
 * `X-Cron-Secret` header, or as `?key=<secret>` — the last for pingers that
 * can only be given a URL.
 */
export function presentedCronSecret(req: {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
}): string | undefined {
  const header = (name: string) => {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const bearer = header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const key = req.query?.key;
  return bearer ?? header('x-cron-secret') ?? (typeof key === 'string' ? key : undefined);
}

export function checkCronSecret(expected: string | undefined, presented: string | undefined): CronAuthResult {
  // Unset means "not configured", which must not read as "anyone may call".
  if (!expected) {
    return { ok: false, status: 503, message: 'CRON_SECRET is not set on this deployment' };
  }
  if (!presented) {
    return { ok: false, status: 401, message: 'Missing cron secret' };
  }
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, message: 'Invalid cron secret' };
  }
  return { ok: true };
}
