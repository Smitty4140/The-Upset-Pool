/**
 * Seed the 2026 PGA Majors into golf_tournaments.
 * Safe to re-run — skips any tournament that already exists by name+season.
 *
 * Run with: NODE_ENV=development npx tsx scripts/seed-pga-majors-2026.ts
 *
 * The Open Championship 2026 is the only major still upcoming as of May 2026.
 * (Masters Apr 9-12, PGA Championship May 21-24, US Open Jun 18-21 already seeded/passed)
 */

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error("This script must be run with NODE_ENV=development");
    process.exit(1);
  }

  const { db } = await import("../server/db.js");
  const { eq, and } = await import("drizzle-orm");
  const { golfTournaments } = await import("../shared/schema.js");

  console.log("=== Seeding 2026 PGA Majors ===\n");

  const MAJORS = [
    {
      name: "The Open Championship 2026",
      location: "Royal Portrush Golf Club",
      season: 2026,
      // Starts Thursday July 16 — first tee time ~6:35am BST = 5:35am UTC
      // picksLockAt = Thursday July 16 at 8:00am ET = 12:00 UTC
      startsAt: new Date("2026-07-16T05:35:00.000Z"),
      picksLockAt: new Date("2026-07-16T12:00:00.000Z"),
      status: "upcoming" as const,
      picksRequired: 4,
      oddsApiSportKey: "golf_the_open_championship_winner",
      espnEventId: null as string | null,
    },
  ];

  let inserted = 0;
  let skipped = 0;

  for (const m of MAJORS) {
    const existing = await db.query.golfTournaments.findFirst({
      where: and(
        eq(golfTournaments.name, m.name),
        eq(golfTournaments.season, m.season)
      ),
    });

    if (existing) {
      console.log(`  ✓ Already exists: ${m.name} (id=${existing.id}) — skipped`);
      skipped++;
      continue;
    }

    const [created] = await db
      .insert(golfTournaments)
      .values(m)
      .returning();

    console.log(`  ✓ Inserted: ${m.name} (id=${created.id})`);
    console.log(`      location:       ${m.location}`);
    console.log(`      startsAt:       ${m.startsAt.toISOString()}`);
    console.log(`      picksLockAt:    ${m.picksLockAt.toISOString()} (Thu 8am ET)`);
    console.log(`      oddsApiSportKey: ${m.oddsApiSportKey}`);
    inserted++;
  }

  console.log(`\n=== Done: ${inserted} inserted, ${skipped} skipped ===`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
