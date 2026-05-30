import { db } from "../server/db";
import { golfTournaments } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const result = await db
    .update(golfTournaments)
    .set({
      status: "active",
      startsAt: threeDaysAgo,
      picksLockAt: yesterday,
    })
    .where(eq(golfTournaments.id, 3))
    .returning();

  console.log("Updated:", result[0]?.name);
  console.log("  status:     ", result[0]?.status);
  console.log("  startsAt:   ", result[0]?.startsAt);
  console.log("  picksLockAt:", result[0]?.picksLockAt);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
