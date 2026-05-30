/**
 * Seed the 2026 PGA Majors into golf_tournaments.
 * Upsert-safe: inserts if missing, updates key fields if row already exists.
 *
 * Run with: NODE_ENV=development npx tsx scripts/seed-pga-majors-2026.ts
 */

async function main() {
  if (process.env.NODE_ENV !== "development" && process.env.SEED_TARGET !== "production") {
    console.error("Set NODE_ENV=development (dev DB) or SEED_TARGET=production (prod DB)");
    process.exit(1);
  }
  const env = process.env.NODE_ENV || "development";
  console.log(`Target environment: ${env}`);

  const { db } = await import("../server/db.js");
  const { eq, and } = await import("drizzle-orm");
  const { golfTournaments } = await import("../shared/schema.js");

  console.log("=== Seeding 2026 PGA Majors ===\n");

  const MAJORS = [
    {
      name: "The Open Championship 2026",
      location: "Royal Portrush Golf Club",
      season: 2026,
      // Starts Thursday July 16 — first tee ~6:35am BST = 5:35am UTC
      // picksLockAt = Thursday July 16 at 8:00am ET = 12:00 UTC
      startsAt: new Date("2026-07-16T05:35:00.000Z"),
      picksLockAt: new Date("2026-07-16T12:00:00.000Z"),
      status: "upcoming" as const,
      picksRequired: 4,
      oddsApiSportKey: "golf_the_open_championship_winner",
      // ESPN event ID confirmed via site.api.espn.com 2026 PGA calendar
      espnEventId: "401811957",
    },
  ];

  let inserted = 0;
  let updated = 0;

  for (const m of MAJORS) {
    const existing = await db.query.golfTournaments.findFirst({
      where: and(
        eq(golfTournaments.name, m.name),
        eq(golfTournaments.season, m.season)
      ),
    });

    if (existing) {
      await db
        .update(golfTournaments)
        .set({
          location: m.location,
          startsAt: m.startsAt,
          picksLockAt: m.picksLockAt,
          picksRequired: m.picksRequired,
          oddsApiSportKey: m.oddsApiSportKey,
          espnEventId: m.espnEventId,
        })
        .where(eq(golfTournaments.id, existing.id));
      console.log(`  ✓ Updated: ${m.name} (id=${existing.id})`);
      updated++;
    } else {
      const [created] = await db
        .insert(golfTournaments)
        .values(m)
        .returning();
      console.log(`  ✓ Inserted: ${m.name} (id=${created.id})`);
      inserted++;
    }

    const t = existing || { id: "?" };
    console.log(`      location:        ${m.location}`);
    console.log(`      startsAt:        ${m.startsAt.toISOString()}`);
    console.log(`      picksLockAt:     ${m.picksLockAt.toISOString()} (Thu 8am ET)`);
    console.log(`      oddsApiSportKey: ${m.oddsApiSportKey}`);
    console.log(`      espnEventId:     ${m.espnEventId}`);
  }

  console.log(`\n=== Done: ${inserted} inserted, ${updated} updated ===`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
