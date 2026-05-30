/**
 * Dev database seed script for US Open 2026 golf tournament.
 *
 * Run with: NODE_ENV=development npx tsx scripts/seed-golf-us-open.ts
 *
 * What this script does:
 *  1. Upserts a US Open 2026 golf tournament (status: upcoming)
 *  2. Upserts a "US Open Pool" golf league linked to that tournament
 *  3. Upserts ~20 golfers + their tournament field entries with realistic odds
 *  4. Upserts 5 test users (pooler1–pooler5) and adds them as league members
 *  5. Clears + re-inserts 4 golf picks per user (with intentional overlap on popular players)
 *
 * Re-running is safe: all upserts use onConflictDoNothing() or explicit deletes before re-insert.
 */

import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Golfer data: name, country, OWGR rank, and American odds (e.g. 600 = +600)
// ─────────────────────────────────────────────────────────────────────────────
const GOLFERS = [
  { name: "Scottie Scheffler",     country: "USA",  owgr: 1,   odds: 600  },
  { name: "Rory McIlroy",          country: "NIR",  owgr: 2,   odds: 800  },
  { name: "Xander Schauffele",     country: "USA",  owgr: 3,   odds: 1200 },
  { name: "Collin Morikawa",       country: "USA",  owgr: 4,   odds: 1400 },
  { name: "Jon Rahm",              country: "ESP",  owgr: 5,   odds: 1600 },
  { name: "Viktor Hovland",        country: "NOR",  owgr: 6,   odds: 1800 },
  { name: "Patrick Cantlay",       country: "USA",  owgr: 7,   odds: 2000 },
  { name: "Wyndham Clark",         country: "USA",  owgr: 8,   odds: 2200 },
  { name: "Brooks Koepka",         country: "USA",  owgr: 9,   odds: 2500 },
  { name: "Bryson DeChambeau",     country: "USA",  owgr: 10,  odds: 2800 },
  { name: "Matt Fitzpatrick",      country: "ENG",  owgr: 11,  odds: 3000 },
  { name: "Tommy Fleetwood",       country: "ENG",  owgr: 12,  odds: 3200 },
  { name: "Shane Lowry",           country: "IRL",  owgr: 13,  odds: 3500 },
  { name: "Sam Burns",             country: "USA",  owgr: 14,  odds: 4000 },
  { name: "Keegan Bradley",        country: "USA",  owgr: 15,  odds: 4500 },
  { name: "Tom Kim",               country: "KOR",  owgr: 16,  odds: 5000 },
  { name: "Hideki Matsuyama",      country: "JPN",  owgr: 17,  odds: 5500 },
  { name: "Tony Finau",            country: "USA",  owgr: 18,  odds: 6000 },
  { name: "Adam Scott",            country: "AUS",  owgr: 19,  odds: 7000 },
  { name: "Russell Henley",        country: "USA",  owgr: 20,  odds: 8000 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5 test users
// ─────────────────────────────────────────────────────────────────────────────
const TEST_USERS = [
  { id: "golf_pooler_1", username: "pooler1", email: "pooler1@test.com" },
  { id: "golf_pooler_2", username: "pooler2", email: "pooler2@test.com" },
  { id: "golf_pooler_3", username: "pooler3", email: "pooler3@test.com" },
  { id: "golf_pooler_4", username: "pooler4", email: "pooler4@test.com" },
  { id: "golf_pooler_5", username: "pooler5", email: "pooler5@test.com" },
];

// Pick assignments by golfer name — intentional overlap on top names
// pooler1 & pooler2 & pooler3 all pick Scheffler; pooler1/2/3/4 pick McIlroy
// Each full set of 4 is unique across users.
const PICK_ASSIGNMENTS: Record<string, string[]> = {
  golf_pooler_1: ["Scottie Scheffler", "Rory McIlroy", "Jon Rahm", "Collin Morikawa"],
  golf_pooler_2: ["Scottie Scheffler", "Rory McIlroy", "Brooks Koepka", "Viktor Hovland"],
  golf_pooler_3: ["Scottie Scheffler", "Rory McIlroy", "Bryson DeChambeau", "Tommy Fleetwood"],
  golf_pooler_4: ["Jon Rahm", "Brooks Koepka", "Shane Lowry", "Sam Burns"],
  golf_pooler_5: ["Viktor Hovland", "Bryson DeChambeau", "Tom Kim", "Patrick Cantlay"],
};

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error("❌  This script must be run with NODE_ENV=development");
    process.exit(1);
  }

  const { db } = await import("../server/db.js");
  const { eq, and } = await import("drizzle-orm");
  const {
    golfTournaments,
    leagues,
    leagueMembers,
    golfPlayers,
    golfTournamentField,
    golfPicks,
    golfPickSelections,
    users,
  } = await import("../shared/schema.js");

  console.log("=== Starting US Open 2026 golf seed ===\n");

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: Upsert the US Open 2026 tournament
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 1: Upserting US Open 2026 tournament...");

  let tournament = await db.query.golfTournaments.findFirst({
    where: and(
      eq(golfTournaments.name, "US Open 2026"),
      eq(golfTournaments.season, 2026)
    ),
  });

  if (!tournament) {
    const [created] = await db.insert(golfTournaments).values({
      name: "US Open 2026",
      location: "Oakmont Country Club",
      season: 2026,
      startsAt: new Date("2026-06-18T12:00:00.000Z"),
      picksLockAt: new Date("2026-06-18T12:00:00.000Z"), // 8am ET = 12:00 UTC
      status: "upcoming",
      picksRequired: 4,
    }).returning();
    tournament = created;
    console.log(`  ✓ Created tournament id=${tournament.id}`);
  } else {
    console.log(`  ✓ Tournament already exists id=${tournament.id}, skipped`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: Upsert the "US Open Pool" golf league
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\nStep 2: Upserting US Open Pool league...");

  let league = await db.query.leagues.findFirst({
    where: and(
      eq(leagues.name, "US Open Pool"),
      eq(leagues.season, 2026)
    ),
  });

  if (!league) {
    const [created] = await db.insert(leagues).values({
      name: "US Open Pool",
      description: "2026 US Open golf pick pool",
      inviteCode: "USOPEN",
      season: 2026,
      sportType: "golf",
      golfTournamentId: tournament.id,
      isArchived: false,
    }).returning();
    league = created;
    console.log(`  ✓ Created league id=${league.id} (invite code: USOPEN)`);
  } else {
    console.log(`  ✓ League already exists id=${league.id}, skipped`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3: Upsert golfers + tournament field entries
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\nStep 3: Upserting golfers and tournament field...");

  const playerIdByName: Record<string, number> = {};
  let golfersInserted = 0;
  let golfersSkipped = 0;
  let fieldInserted = 0;
  let fieldSkipped = 0;

  for (const g of GOLFERS) {
    // Upsert player
    let player = await db.query.golfPlayers.findFirst({
      where: eq(golfPlayers.name, g.name),
    });

    if (!player) {
      const [created] = await db.insert(golfPlayers).values({
        name: g.name,
        country: g.country,
        isAmateur: false,
      }).returning();
      player = created;
      golfersInserted++;
    } else {
      golfersSkipped++;
    }

    playerIdByName[g.name] = player.id;

    // Upsert field entry
    const existing = await db.query.golfTournamentField.findFirst({
      where: and(
        eq(golfTournamentField.tournamentId, tournament.id),
        eq(golfTournamentField.playerId, player.id)
      ),
    });

    if (!existing) {
      await db.insert(golfTournamentField).values({
        tournamentId: tournament.id,
        playerId: player.id,
        owgrAtLock: g.owgr,
        odds: g.odds,
      });
      fieldInserted++;
    } else {
      fieldSkipped++;
    }
  }

  console.log(`  ✓ Golfers: ${golfersInserted} inserted, ${golfersSkipped} skipped`);
  console.log(`  ✓ Field entries: ${fieldInserted} inserted, ${fieldSkipped} skipped`);

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 4: Upsert test users and league memberships
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\nStep 4: Upserting test users and league memberships...");

  const password = await hashPassword("Password123!");
  let usersInserted = 0;
  let membersInserted = 0;

  for (const u of TEST_USERS) {
    await db.insert(users).values({
      id: u.id,
      username: u.username,
      email: u.email,
      password,
      receiveNotifications: false,
    }).onConflictDoNothing();

    const existing = await db.query.users.findFirst({ where: eq(users.id, u.id) });
    if (existing) usersInserted++;

    const memberResult = await db.insert(leagueMembers).values({
      leagueId: league.id,
      userId: u.id,
      isAdmin: false,
      isActive: true,
    }).onConflictDoNothing().returning();

    if (memberResult.length > 0) {
      membersInserted++;
      console.log(`  ✓ ${u.username} joined league`);
    } else {
      console.log(`  ✓ ${u.username} already a member, skipped`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 5: Clear and re-insert picks for each user
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\nStep 5: Inserting golf picks (clearing existing first)...");

  let totalPicksInserted = 0;

  for (const u of TEST_USERS) {
    const golferNames = PICK_ASSIGNMENTS[u.id];

    // Find and delete existing pick header (cascades to selections via delete below)
    const existingPick = await db.query.golfPicks.findFirst({
      where: and(
        eq(golfPicks.userId, u.id),
        eq(golfPicks.leagueId, league.id),
        eq(golfPicks.tournamentId, tournament.id)
      ),
    });

    if (existingPick) {
      await db.delete(golfPickSelections).where(eq(golfPickSelections.pickId, existingPick.id));
      await db.delete(golfPicks).where(eq(golfPicks.id, existingPick.id));
    }

    // Insert pick header
    const [pick] = await db.insert(golfPicks).values({
      userId: u.id,
      leagueId: league.id,
      tournamentId: tournament.id,
    }).returning();

    // Insert 4 selections
    for (const name of golferNames) {
      const playerId = playerIdByName[name];
      if (!playerId) {
        console.error(`  ❌  Could not find player id for "${name}"`);
        continue;
      }
      await db.insert(golfPickSelections).values({
        pickId: pick.id,
        playerId,
      });
      totalPicksInserted++;
    }

    const oddsLabels = golferNames.map((n) => {
      const g = GOLFERS.find((x) => x.name === n)!;
      return `${n.split(" ").pop()} +${g.odds}`;
    }).join(", ");
    console.log(`  ✓ ${u.username}: ${oddsLabels}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n=== Seeding complete! ===\n");
  console.log(`Tournament:  US Open 2026 (id=${tournament.id}) — status: upcoming`);
  console.log(`League:      US Open Pool (id=${league.id}) — invite code: USOPEN`);
  console.log(`Golfers:     ${GOLFERS.length} in field`);
  console.log(`Users:       ${TEST_USERS.length} (pooler1–pooler5)`);
  console.log(`Picks:       ${totalPicksInserted} total selections (4 per user)`);
  console.log("\nOverlap summary (popular golfers across multiple users):");
  console.log("  Scottie Scheffler (+600) → pooler1, pooler2, pooler3");
  console.log("  Rory McIlroy     (+800) → pooler1, pooler2, pooler3");
  console.log("  Brooks Koepka   (+2500) → pooler2, pooler4");
  console.log("  Jon Rahm        (+1600) → pooler1, pooler4");
  console.log("  Viktor Hovland  (+1800) → pooler2, pooler5");
  console.log("  Bryson DeChambeau(+2800) → pooler3, pooler5");

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
