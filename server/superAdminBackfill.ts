import type { Pool } from "@neondatabase/serverless";
import { BOOTSTRAP_SUPER_USER_IDS } from "./superAdmin";

export type SuperAdminBackfillResult = {
  columnAdded: boolean;
  superAdmins: number;
  bootstrapped: number;
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
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
