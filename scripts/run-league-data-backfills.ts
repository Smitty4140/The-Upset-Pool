import { pool } from "../server/db";
import { runLeagueDataBackfills } from "../server/leagueDataBackfill";

try {
  const result = await runLeagueDataBackfills(pool);
  console.log("[League data] Backfills and verification complete", result);
} finally {
  await pool.end();
}