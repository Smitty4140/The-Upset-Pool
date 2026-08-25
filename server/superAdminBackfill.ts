import type { Pool } from "@neondatabase/serverless";
import { BOOTSTRAP_SUPER_USER_IDS, OWNER_SUPER_ADMIN_EMAILS } from "./superAdmin";

export type SuperAdminBackfillResult = {
  columnAdded: boolean;
  superAdmins: number;
  bootstrapped: number;
  ownersGranted: number;
  ownersMissing: string[];
};

/**
 * Makes `users.is_super_user` exist and guarantees the site always has at
 * least one super admin. Runs at boot alongside the league backfill so a
 * deployment that hasn't run `db:push` still comes up with a working Site
 * Admin page rather than a 403 nobody can lift.
 */
export async function runSuperAdminBackfill(
  databasePool: Pool,
): Promise<SuperAdminBackfillResult> {
  const client = await databasePool.connect();

  try {
    await client.query("BEGIN");

    const columnCheck = await client.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'is_super_user'
    `);
    const columnAdded = columnCheck.rowCount === 0;

    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_super_user boolean DEFAULT false NOT NULL
    `);

    await client.query(`
      UPDATE users SET is_super_user = false WHERE is_super_user IS NULL
    `);

    // Owner accounts are granted on every boot, so a deploy always comes up
    // with them holding super admin — including the first boot after they sign
    // up. The API refuses to revoke them, so this can't undo a deliberate
    // removal.
    let ownersGranted = 0;
    let ownersMissing: string[] = [];
    if (OWNER_SUPER_ADMIN_EMAILS.length > 0) {
      const granted = await client.query(
        `UPDATE users
         SET is_super_user = true, updated_at = NOW()
         WHERE LOWER(email) = ANY($1::varchar[]) AND is_super_user = false`,
        [OWNER_SUPER_ADMIN_EMAILS],
      );
      ownersGranted = granted.rowCount ?? 0;

      // An owner with no account yet is normal (they just haven't signed up),
      // but it is worth saying out loud rather than silently doing nothing.
      const present = await client.query(
        `SELECT LOWER(email) AS email FROM users WHERE LOWER(email) = ANY($1::varchar[])`,
        [OWNER_SUPER_ADMIN_EMAILS],
      );
      const presentEmails = new Set(present.rows.map((row: any) => row.email));
      ownersMissing = OWNER_SUPER_ADMIN_EMAILS.filter((email) => !presentEmails.has(email));
    }

    // Seed the bootstrap accounts only when nobody holds the flag. Once a
    // real super admin exists, membership is managed entirely from the app —
    // this must never resurrect an account the owners deliberately removed.
    const existing = await client.query(`
      SELECT COUNT(*)::int AS count FROM users WHERE is_super_user = true
    `);
    let bootstrapped = 0;
    if (existing.rows[0].count === 0) {
      const seeded = await client.query(
        `UPDATE users SET is_super_user = true, updated_at = NOW() WHERE id = ANY($1::varchar[])`,
        [BOOTSTRAP_SUPER_USER_IDS],
      );
      bootstrapped = seeded.rowCount ?? 0;
    }

    const total = await client.query(`
      SELECT COUNT(*)::int AS count FROM users WHERE is_super_user = true
    `);

    await client.query("COMMIT");

    return {
      columnAdded,
      superAdmins: total.rows[0].count,
      bootstrapped,
      ownersGranted,
      ownersMissing,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
