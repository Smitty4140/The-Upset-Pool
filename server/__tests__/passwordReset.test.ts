import { describe, it, expect } from "vitest";
import {
  createResetToken,
  readResetTokenUserId,
  verifyResetToken,
  RESET_TOKEN_TTL_MS,
} from "../passwordReset";
import { buildPasswordResetEmail, passwordResetUrl } from "../email";

const SECRET = "test-secret";
const user = { id: "user_123", email: "a@example.com", password: "hash.salt" };
const NOW = 1_800_000_000_000;

describe("password reset tokens", () => {
  it("verifies a fresh token for the same account", () => {
    const token = createResetToken(user, SECRET, NOW);
    expect(readResetTokenUserId(token)).toBe(user.id);
    expect(verifyResetToken(token, user, SECRET, NOW + 1000)).toBe(true);
  });

  it("expires after the TTL", () => {
    const token = createResetToken(user, SECRET, NOW);
    expect(verifyResetToken(token, user, SECRET, NOW + RESET_TOKEN_TTL_MS + 1)).toBe(false);
  });

  it("stops working once the password changes, so each link is single-use", () => {
    const token = createResetToken(user, SECRET, NOW);
    expect(verifyResetToken(token, { ...user, password: "new.hash" }, SECRET, NOW)).toBe(false);
  });

  it("works for Google-only accounts with no password yet", () => {
    const googleUser = { ...user, password: null };
    const token = createResetToken(googleUser, SECRET, NOW);
    expect(verifyResetToken(token, googleUser, SECRET, NOW)).toBe(true);
    expect(verifyResetToken(token, { ...googleUser, password: "set.now" }, SECRET, NOW)).toBe(false);
  });

  it("rejects tokens for another account, a different secret, or tampered parts", () => {
    const token = createResetToken(user, SECRET, NOW);
    const [id, expires, sig] = token.split(".");
    expect(verifyResetToken(token, { ...user, id: "someone_else" }, SECRET, NOW)).toBe(false);
    expect(verifyResetToken(token, { ...user, email: "b@example.com" }, SECRET, NOW)).toBe(false);
    expect(verifyResetToken(token, user, "other-secret", NOW)).toBe(false);
    expect(verifyResetToken(`${id}.${Number(expires) + 1e9}.${sig}`, user, SECRET, NOW)).toBe(false);
    expect(verifyResetToken(`${id}.${expires}.${sig}x`, user, SECRET, NOW)).toBe(false);
    expect(verifyResetToken("garbage", user, SECRET, NOW)).toBe(false);
  });
});

describe("password reset email", () => {
  it("links to the reset page with the token in both parts", () => {
    const url = passwordResetUrl("abc.123.xyz");
    expect(url).toBe("https://www.upsetpool.com/reset-password?token=abc.123.xyz");
    const content = buildPasswordResetEmail("Commish", url);
    expect(content.html).toContain(url);
    expect(content.text).toContain(url);
  });
});
