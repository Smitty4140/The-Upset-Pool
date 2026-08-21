import type { Pool } from "@neondatabase/serverless";

export type LeagueDataBackfillResult = {
  leaguesUpdated: number;
  membershipsUpdated: number;
  nicknamesUpdated: number;
};

const toNumber = (value: unknown): number => Number(value ?? 0);

export async function runLeagueDataBackfills(
  databasePool: Pool,
): Promise<LeagueDataBackfillResult> {
  const client = await databasePool.connect();

  try {
    await client.query("BEGIN");

    const leagueResult = await client.query(`
      UPDATE leagues AS league
      SET
        season = COALESCE(
          league.season,
          (
            SELECT tournament.season
            FROM golf_tournaments AS tournament
            WHERE tournament.id = league.golf_tournament_id
          ),
          EXTRACT(YEAR FROM COALESCE(league.created_at, NOW()))::int
        ),
        sport_type = CASE
          WHEN league.sport_type IN ('nfl', 'golf') THEN league.sport_type
          WHEN league.golf_tournament_id IS NOT NULL THEN 'golf'
          ELSE 'nfl'
        END,
        default_member_is_active = COALESCE(league.default_member_is_active, true),
        updated_at = NOW()
      WHERE
        league.season IS NULL
        OR league.sport_type IS NULL
        OR league.sport_type NOT IN ('nfl', 'golf')
        OR league.default_member_is_active IS NULL
    `);

    const membershipResult = await client.query(`
      UPDATE league_members
      SET
        is_admin = COALESCE(is_admin, false),
        is_active = COALESCE(is_active, true),
        updated_at = NOW()
      WHERE is_admin IS NULL OR is_active IS NULL
    `);

    const nicknameResult = await client.query(`
      UPDATE league_members AS membership
      SET
        nickname = app_user.username,
        updated_at = NOW()
      FROM users AS app_user
      WHERE
        membership.user_id = app_user.id
        AND membership.nickname IS NULL
        AND app_user.username IS NOT NULL
    `);

    const verificationResult = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM leagues WHERE season IS NULL) AS leagues_missing_season,
        (
          SELECT COUNT(*)
          FROM leagues
          WHERE sport_type IS NULL OR sport_type NOT IN ('nfl', 'golf')
        ) AS leagues_with_invalid_sport,
        (
          SELECT COUNT(*)
          FROM leagues
          WHERE default_member_is_active IS NULL
        ) AS leagues_missing_member_default,
        (
          SELECT COUNT(*)
          FROM leagues
          WHERE sport_type = 'golf' AND golf_tournament_id IS NULL
        ) AS golf_leagues_missing_tournament,
        (
          SELECT COUNT(*)
          FROM league_members
          WHERE is_admin IS NULL OR is_active IS NULL
        ) AS memberships_missing_access_flags
    `);

    const verification = verificationResult.rows[0];
    const invalidCounts = {
      leaguesMissingSeason: toNumber(verification.leagues_missing_season),
      leaguesWithInvalidSport: toNumber(verification.leagues_with_invalid_sport),
      leaguesMissingMemberDefault: toNumber(verification.leagues_missing_member_default),
      golfLeaguesMissingTournament: toNumber(verification.golf_leagues_missing_tournament),
      membershipsMissingAccessFlags: toNumber(verification.memberships_missing_access_flags),
    };

    if (Object.values(invalidCounts).some((count) => count > 0)) {
      throw new Error(
        `League data verification failed after backfill: ${JSON.stringify(invalidCounts)}`,
      );
    }

    await client.query("COMMIT");

    return {
      leaguesUpdated: leagueResult.rowCount ?? 0,
      membershipsUpdated: membershipResult.rowCount ?? 0,
      nicknamesUpdated: nicknameResult.rowCount ?? 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}