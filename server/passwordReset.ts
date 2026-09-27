import { createHmac, timingSafeEqual } from "crypto";

/** How long a reset link stays good after it is emailed. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

type ResetSubject = { id: string; email: string; password: string | null };

/**
 * Reset tokens are signed rather than stored, so there is no table to migrate.
 *
 * The signature covers the account's current password hash and email, which is
 * what makes a link single-use: the moment the password is changed (by this
 * link or any other way) every outstanding link stops verifying. Accounts with
 * no password yet — Google-only sign-ups — can use the same flow to set one.
 */
function sign(user: ResetSubject, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`password-reset|${user.id}|${user.email}|${user.password ?? ""}|${expiresAt}`)
    .digest("base64url");
}

export function createResetToken(
  user: ResetSubject,
  secret: string,
  now: number = Date.now(),
): string {
  const expiresAt = now + RESET_TOKEN_TTL_MS;
  const id = Buffer.from(user.id, "utf8").toString("base64url");
  return `${id}.${expiresAt}.${sign(user, expiresAt, secret)}`;
}

/** Pulls the user id out of a token without trusting it; verify separately. */
export function readResetTokenUserId(token: string): string | null {
  const [id] = String(token).split(".");
  if (!id) return null;
  try {
    return Buffer.from(id, "base64url").toString("utf8") || null;
  } catch {
    return null;
  }
}

export function verifyResetToken(
  token: string,
  user: ResetSubject,
  secret: string,
  now: number = Date.now(),
): boolean {
  const parts = String(token).split(".");
  if (parts.length !== 3) return false;
  const [, expiresRaw, signature] = parts;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
  if (readResetTokenUserId(token) !== user.id) return false;

  const expected = Buffer.from(sign(user, expiresAt, secret));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

const PRODUCTION_HOSTS = ["upsetpool.com", "www.upsetpool.com"];

/**
 * Origin to put in the emailed reset link: the site the request came from, so
 * a reset started in the dev preview lands back in dev. The Host header is
 * attacker-controlled, so only known hosts are honoured — otherwise anyone
 * could request a reset for someone else and make the link in that person's
 * email point at a site they control, which receives the working token the
 * moment it's clicked. Anything unknown gets undefined, meaning production.
 */
export function resetLinkOrigin(
  host: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!host) return undefined;
  const normalized = host.trim().toLowerCase();

  const replitHosts = [
    ...(env.REPLIT_DOMAINS ?? "").split(","),
    env.REPLIT_DEV_DOMAIN ?? "",
  ]
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (PRODUCTION_HOSTS.includes(normalized) || replitHosts.includes(normalized)) {
    return `https://${normalized}`;
  }
  if (env.NODE_ENV === "development" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) {
    return `http://${normalized}`;
  }
  return undefined;
}
