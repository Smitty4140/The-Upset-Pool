import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { runLeagueDataBackfills } from "../server/leagueDataBackfill";

neonConfig.webSocketConstructor = ws;

async function syncDevelopmentLeagueSchema(
  databasePool: Pool,
  databaseLabel: string,
) {
  const client = await databasePool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE leagues
        ADD COLUMN IF NOT EXISTS season integer DEFAULT EXTRACT(YEAR FROM NOW())::int,
        ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS archived_at timestamp,
        ADD COLUMN IF NOT EXISTS sport_type varchar DEFAULT 'nfl' NOT NULL,
        ADD COLUMN IF NOT EXISTS golf_tournament_id integer,
        ADD COLUMN IF NOT EXISTS default_member_is_active boolean DEFAULT true NOT NULL
    `);

    await client.query(`
      ALTER TABLE leagues
        ALTER COLUMN season SET DEFAULT EXTRACT(YEAR FROM NOW())::int,
        ALTER COLUMN sport_type SET DEFAULT 'nfl',
        ALTER COLUMN default_member_is_active SET DEFAULT true
    `);

    await client.query(`
      ALTER TABLE league_members
        ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
        ADD COLUMN IF NOT EXISTS nickname varchar
    `);

    await client.query(`
      ALTER TABLE golf_tournaments
        ADD COLUMN IF NOT EXISTS picks_required integer DEFAULT 4 NOT NULL,
        ADD COLUMN IF NOT EXISTS odds_api_sport_key varchar,
        ADD COLUMN IF NOT EXISTS espn_event_id varchar,
        ADD COLUMN IF NOT EXISTS last_poll_at timestamp
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const backfillResult = await runLeagueDataBackfills(databasePool);
  console.log(`[League schema] ${databaseLabel} sync complete`, backfillResult);
}

async function main() {
  if (process.env.NODE_ENV !== "development" || !process.env.DATABASE_URL) {
    throw new Error(
      "League schema sync is development-only and requires DATABASE_URL",
    );
  }

  const targets = [
    {
      label: "managed development database",
      connectionString: process.env.DATABASE_URL,
    },
  ];

  if (
    process.env.DEV_DATABASE_URL &&
    process.env.DEV_DATABASE_URL !== process.env.DATABASE_URL
  ) {
    targets.push({
      label: "application development database",
      connectionString: process.env.DEV_DATABASE_URL,
    });
  }

  for (const target of targets) {
    const databasePool = new Pool({
      connectionString: target.connectionString,
      max: 2,
    });

    try {
      await syncDevelopmentLeagueSchema(databasePool, target.label);
    } finally {
      await databasePool.end();
    }
  }
}

await main();