import { db } from "../server/db";
import { golfTournaments } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const result = await db
    .update(golfTournaments)
    .set({ status: "active" })
    .where(eq(golfTournaments.id, 3))
    .returning();
  console.log("Updated:", result[0]?.name, "→ status:", result[0]?.status);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
