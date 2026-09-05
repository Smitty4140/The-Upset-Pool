import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { buildPreflightTestEmail } from "../email";

const DIAGNOSTICS = readFileSync(resolve(import.meta.dirname, "../diagnostics.ts"), "utf8");

/**
 * The value of the preflight checks depends entirely on them being unable to
 * touch production data. A behavioral spy could only prove that the paths a
 * test happened to exercise didn't write; reading the source proves no such
 * path exists to begin with.
 */
describe("diagnostics module cannot mutate", () => {
  // Strip comments and imports first: the file explains what it must not do,
  // and `from './db.js'` would otherwise read as a `db.` call site.
  const code = DIAGNOSTICS
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];?$/gm, "");

  it("never calls a drizzle write", () => {
    expect(code).not.toMatch(/\bdb\s*\.\s*insert\b/);
    expect(code).not.toMatch(/\bdb\s*\.\s*update\b/);
    expect(code).not.toMatch(/\bdb\s*\.\s*delete\b/);
  });

  it("never recalculates picks", () => {
    expect(code).not.toMatch(/processGameResults/);
  });

  it("never calls a storage mutation", () => {
    // Every IStorage writer is create*/update*/upsert*/delete*/process*.
    expect(code).not.toMatch(/storage\s*\.\s*(create|update|upsert|delete|process)/i);
  });

  it("only ever selects", () => {
    const dbCalls = code.match(/\bdb\s*\.\s*\w+/g) ?? [];
    for (const call of dbCalls) {
      expect(call.replace(/\s+/g, "")).toBe("db.select");
    }
  });

  it("declares itself read-only to callers", () => {
    // Both diagnostics set readOnly: true, which the endpoints surface as
    // "no game data changed" — keep that promise wired up.
    expect(DIAGNOSTICS).toMatch(/readOnly:\s*true/);
  });
});

describe("preflight test email", () => {
  it("is unmistakably a test", () => {
    const mail = buildPreflightTestEmail("Commish", new Date("2026-09-05T15:00:00Z"));
    expect(mail.subject).toContain("[TEST]");
    expect(mail.html).toContain("Email Delivery Test");
  });

  it("tells the reader nobody else got it", () => {
    const mail = buildPreflightTestEmail("Commish");
    expect(mail.html).toContain("No league member received this message");
    expect(mail.text).toContain("No league member received this message");
  });

  it("carries no league or pick content that could confuse a member", () => {
    const mail = buildPreflightTestEmail("Commish");
    expect(mail.html).not.toMatch(/underdog|picks lock|Week \d/i);
  });

  it("timestamps the request in Eastern Time", () => {
    const mail = buildPreflightTestEmail("Commish", new Date("2026-09-05T15:00:00Z"));
    // 15:00 UTC on 2026-09-05 is 11:00 AM EDT
    expect(mail.subject).toContain("11:00 AM");
    expect(mail.subject).toContain("ET");
  });
});
