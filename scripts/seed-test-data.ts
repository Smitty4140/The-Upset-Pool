/**
 * Dev database seeding script for testing season archiving.
 *
 * Run with: NODE_ENV=development npx tsx scripts/seed-test-data.ts
 *
 * What this script does:
 *  1. Archives League 1 (2025 season) and marks existing pick as correct (6.0 pts)
 *  2. Updates League 2 to become the 2026 active season league
 *  3. Creates 3 fake users and adds them + Commish to League 2
 *  4. Seeds 3 weeks for the 2026 season:
 *       - Week 1 & 2: past, completed games with results and scored picks
 *       - Week 3: current open week, 3 games already started + 5 future games
 *  5. Creates picks for all 4 users in weeks 1 & 2, plus Commish's week 3 pick
 *
 * Final 2025 standings: Commish = 6.0 pts
 * Final 2026 standings (after weeks 1+2): Commish=15.0, Jordan=11.5, Alex=10.5, Sam=7.0
 */

import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function main() {
  const { db } = await import("../server/db.js");
  const { eq } = await import("drizzle-orm");
  const {
    leagues,
    users,
    leagueMembers,
    nflWeeks,
    nflGames,
    userPicks,
  } = await import("../shared/schema.js");

  console.log("=== Starting dev data seed ===\n");

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: Archive League 1 (2025 season)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 1: Archiving League 1 (2025 season)...");
  await db
    .update(leagues)
    .set({ isArchived: true, archivedAt: new Date(), season: 2025 })
    .where(eq(leagues.id, 1));
  console.log("  ✓ League 1 archived");

  // Mark the existing 2025 pick as correct: 6.0 pts
  await db
    .update(userPicks)
    .set({ won: true, pointsEarned: "6.0" })
    .where(eq(userPicks.id, 2));
  console.log("  ✓ Existing pick (id=2) marked as won, pointsEarned=6.0\n");

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: Set up League 2 as the 2026 active league
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 2: Updating League 2 to 2026 season...");
  await db
    .update(leagues)
    .set({ season: 2026, name: "2026 NFL Upset Pool", isArchived: false, archivedAt: null })
    .where(eq(leagues.id, 2));
  console.log("  ✓ League 2 updated to season 2026\n");

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3: Create 3 fake test users
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 3: Creating fake users...");
  const password = await hashPassword("Password123!");

  const fakeUsers = [
    { id: "test_user_alex",   username: "PoolerAlex",   email: "alex@test.upsetpool.com" },
    { id: "test_user_jordan", username: "PoolerJordan", email: "jordan@test.upsetpool.com" },
    { id: "test_user_sam",    username: "PoolerSam",    email: "sam@test.upsetpool.com" },
  ];

  for (const u of fakeUsers) {
    await db.insert(users).values({
      id: u.id,
      username: u.username,
      email: u.email,
      password,
      receiveNotifications: false,
    }).onConflictDoNothing();
    console.log(`  ✓ Created user ${u.username} (${u.email})`);
  }
  console.log();

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 4: Add fake users to League 2 (Commish already a member)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 4: Adding users to League 2...");
  for (const u of fakeUsers) {
    await db.insert(leagueMembers).values({
      leagueId: 2,
      userId: u.id,
      isAdmin: false,
      isActive: true,
      hasPaid: true,
    }).onConflictDoNothing();
    console.log(`  ✓ ${u.username} added to League 2`);
  }
  // Make sure Commish is active in League 2 with hasPaid=true
  await db
    .update(leagueMembers)
    .set({ isActive: true, hasPaid: true })
    .where(eq(leagueMembers.leagueId, 2));
  console.log("  ✓ Commish membership in League 2 confirmed\n");

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 5: Create 2026 NFL weeks
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 5: Creating 2026 NFL weeks...");

  const [week2026_1] = await db.insert(nflWeeks).values({
    weekNumber: 1,
    season: 2026,
    startDate: "2026-02-06",
    endDate:   "2026-02-12",
    active: false,
    picksLockAt: new Date("2026-02-08T18:00:00.000Z"),
  }).returning();

  const [week2026_2] = await db.insert(nflWeeks).values({
    weekNumber: 2,
    season: 2026,
    startDate: "2026-02-13",
    endDate:   "2026-02-19",
    active: false,
    picksLockAt: new Date("2026-02-15T18:00:00.000Z"),
  }).returning();

  const [week2026_3] = await db.insert(nflWeeks).values({
    weekNumber: 3,
    season: 2026,
    startDate: "2026-03-01",
    endDate:   "2026-03-09",
    active: true,
    picksLockAt: new Date("2026-03-08T18:00:00.000Z"),
  }).returning();

  console.log(`  ✓ Week 1 (id=${week2026_1.id}): Feb 6-12, locked`);
  console.log(`  ✓ Week 2 (id=${week2026_2.id}): Feb 13-19, locked`);
  console.log(`  ✓ Week 3 (id=${week2026_3.id}): Mar 1-9, open\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 6: Create Week 1 games (Feb 8, 1pm ET = 18:00 UTC, all completed)
  // Spread: negative = home team favored. Underdog = team that gets the points.
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 6: Creating Week 1 games (all completed)...");
  const w1GameTime = new Date("2026-02-08T18:00:00.000Z");

  // home=DET(11) vs away=KC(1),  spread=-7.5 → KC underdog wins 24-17
  const [w1g1] = await db.insert(nflGames).values({
    weekId: week2026_1.id, homeTeamId: 11, awayTeamId: 1,
    spread: "-7.5", gameTime: w1GameTime,
    homeTeamScore: 17, awayTeamScore: 24, winningTeamId: 1, completed: true,
  }).returning();

  // home=BUF(5) vs away=SF(2),   spread=-9.0 → SF underdog loses; BUF wins 31-24
  const [w1g2] = await db.insert(nflGames).values({
    weekId: week2026_1.id, homeTeamId: 5, awayTeamId: 2,
    spread: "-9.0", gameTime: w1GameTime,
    homeTeamScore: 31, awayTeamScore: 24, winningTeamId: 5, completed: true,
  }).returning();

  // home=PHI(8) vs away=DAL(3),  spread=3.5 → PHI underdog wins 21-17
  const [w1g3] = await db.insert(nflGames).values({
    weekId: week2026_1.id, homeTeamId: 8, awayTeamId: 3,
    spread: "3.5", gameTime: w1GameTime,
    homeTeamScore: 21, awayTeamScore: 17, winningTeamId: 8, completed: true,
  }).returning();

  // home=MIN(27) vs away=GB(4),  spread=-2.5 → GB underdog loses; MIN wins 27-24
  const [w1g4] = await db.insert(nflGames).values({
    weekId: week2026_1.id, homeTeamId: 27, awayTeamId: 4,
    spread: "-2.5", gameTime: w1GameTime,
    homeTeamScore: 27, awayTeamScore: 24, winningTeamId: 27, completed: true,
  }).returning();

  // home=CIN(7) vs away=BAL(6),  spread=4.0 → CIN underdog wins 28-24
  const [w1g5] = await db.insert(nflGames).values({
    weekId: week2026_1.id, homeTeamId: 7, awayTeamId: 6,
    spread: "4.0", gameTime: w1GameTime,
    homeTeamScore: 28, awayTeamScore: 24, winningTeamId: 7, completed: true,
  }).returning();

  // home=LAR(10) vs away=MIA(9), spread=-1.5 → MIA underdog loses; LAR wins 23-20
  const [w1g6] = await db.insert(nflGames).values({
    weekId: week2026_1.id, homeTeamId: 10, awayTeamId: 9,
    spread: "-1.5", gameTime: w1GameTime,
    homeTeamScore: 23, awayTeamScore: 20, winningTeamId: 10, completed: true,
  }).returning();

  // home=NE(15) vs away=CHI(12), spread=6.5 → NE underdog wins 17-14
  const [w1g7] = await db.insert(nflGames).values({
    weekId: week2026_1.id, homeTeamId: 15, awayTeamId: 12,
    spread: "6.5", gameTime: w1GameTime,
    homeTeamScore: 17, awayTeamScore: 14, winningTeamId: 15, completed: true,
  }).returning();

  // home=ATL(14) vs away=NO(13), spread=-3.0 → NO underdog loses; ATL wins 30-21
  const [w1g8] = await db.insert(nflGames).values({
    weekId: week2026_1.id, homeTeamId: 14, awayTeamId: 13,
    spread: "-3.0", gameTime: w1GameTime,
    homeTeamScore: 30, awayTeamScore: 21, winningTeamId: 14, completed: true,
  }).returning();

  console.log(`  ✓ 8 games created for Week 1\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 7: Create Week 2 games (Feb 15, 1pm ET = 18:00 UTC, all completed)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 7: Creating Week 2 games (all completed)...");
  const w2GameTime = new Date("2026-02-15T18:00:00.000Z");

  // home=SEA(24) vs away=PIT(26), spread=-4.0 → PIT underdog loses; SEA wins 27-23
  const [w2g1] = await db.insert(nflGames).values({
    weekId: week2026_2.id, homeTeamId: 24, awayTeamId: 26,
    spread: "-4.0", gameTime: w2GameTime,
    homeTeamScore: 27, awayTeamScore: 23, winningTeamId: 24, completed: true,
  }).returning();

  // home=IND(30) vs away=TEN(21), spread=3.0 → IND underdog wins 24-21
  const [w2g2] = await db.insert(nflGames).values({
    weekId: week2026_2.id, homeTeamId: 30, awayTeamId: 21,
    spread: "3.0", gameTime: w2GameTime,
    homeTeamScore: 24, awayTeamScore: 21, winningTeamId: 30, completed: true,
  }).returning();

  // home=JAX(22) vs away=HOU(29), spread=7.5 → JAX underdog wins 14-10
  const [w2g3] = await db.insert(nflGames).values({
    weekId: week2026_2.id, homeTeamId: 22, awayTeamId: 29,
    spread: "7.5", gameTime: w2GameTime,
    homeTeamScore: 14, awayTeamScore: 10, winningTeamId: 22, completed: true,
  }).returning();

  // home=WAS(20) vs away=CAR(23), spread=-2.5 → CAR underdog loses; WAS wins 24-20
  const [w2g4] = await db.insert(nflGames).values({
    weekId: week2026_2.id, homeTeamId: 20, awayTeamId: 23,
    spread: "-2.5", gameTime: w2GameTime,
    homeTeamScore: 24, awayTeamScore: 20, winningTeamId: 20, completed: true,
  }).returning();

  // home=DEN(31) vs away=LV(28),  spread=-5.0 → LV underdog loses; DEN wins 21-17
  const [w2g5] = await db.insert(nflGames).values({
    weekId: week2026_2.id, homeTeamId: 31, awayTeamId: 28,
    spread: "-5.0", gameTime: w2GameTime,
    homeTeamScore: 21, awayTeamScore: 17, winningTeamId: 31, completed: true,
  }).returning();

  // home=NYJ(16) vs away=NYG(19), spread=3.5 → NYJ underdog wins 24-17
  const [w2g6] = await db.insert(nflGames).values({
    weekId: week2026_2.id, homeTeamId: 16, awayTeamId: 19,
    spread: "3.5", gameTime: w2GameTime,
    homeTeamScore: 24, awayTeamScore: 17, winningTeamId: 16, completed: true,
  }).returning();

  // home=ARI(17) vs away=TB(32),  spread=8.5 → ARI underdog wins 23-20
  const [w2g7] = await db.insert(nflGames).values({
    weekId: week2026_2.id, homeTeamId: 17, awayTeamId: 32,
    spread: "8.5", gameTime: w2GameTime,
    homeTeamScore: 23, awayTeamScore: 20, winningTeamId: 17, completed: true,
  }).returning();

  // home=CLE(25) vs away=LAC(18), spread=6.0 → CLE underdog loses; LAC wins 28-17
  const [w2g8] = await db.insert(nflGames).values({
    weekId: week2026_2.id, homeTeamId: 25, awayTeamId: 18,
    spread: "6.0", gameTime: w2GameTime,
    homeTeamScore: 17, awayTeamScore: 28, winningTeamId: 18, completed: true,
  }).returning();

  console.log(`  ✓ 8 games created for Week 2\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 8: Create Week 3 games (current open week — mix of started and future)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 8: Creating Week 3 games (3 started, 5 future)...");
  const w3StartedTime = new Date("2026-03-04T16:00:00.000Z"); // 11am ET today — past
  const w3FutureTime  = new Date("2026-03-08T18:00:00.000Z"); // 1pm ET Sunday — future

  // Already-started games (spreads set, no results yet)
  // home=KC(1) vs away=SF(2),   spread=-3.5 → SF underdog
  const [w3g1] = await db.insert(nflGames).values({
    weekId: week2026_3.id, homeTeamId: 1, awayTeamId: 2,
    spread: "-3.5", gameTime: w3StartedTime, completed: false,
  }).returning();

  // home=DAL(3) vs away=GB(4),  spread=4.0 → DAL underdog
  const [w3g2] = await db.insert(nflGames).values({
    weekId: week2026_3.id, homeTeamId: 3, awayTeamId: 4,
    spread: "4.0", gameTime: w3StartedTime, completed: false,
  }).returning();

  // home=BUF(5) vs away=BAL(6), spread=-2.0 → BAL underdog
  const [w3g3] = await db.insert(nflGames).values({
    weekId: week2026_3.id, homeTeamId: 5, awayTeamId: 6,
    spread: "-2.0", gameTime: w3StartedTime, completed: false,
  }).returning();

  // Future games
  // home=PHI(8) vs away=DET(11), spread=5.5 → PHI underdog
  await db.insert(nflGames).values({
    weekId: week2026_3.id, homeTeamId: 8, awayTeamId: 11,
    spread: "5.5", gameTime: w3FutureTime, completed: false,
  });

  // home=MIN(27) vs away=CIN(7),  spread=-3.0 → CIN underdog
  await db.insert(nflGames).values({
    weekId: week2026_3.id, homeTeamId: 27, awayTeamId: 7,
    spread: "-3.0", gameTime: w3FutureTime, completed: false,
  });

  // home=PIT(26) vs away=SEA(24), spread=-1.5 → SEA underdog
  await db.insert(nflGames).values({
    weekId: week2026_3.id, homeTeamId: 26, awayTeamId: 24,
    spread: "-1.5", gameTime: w3FutureTime, completed: false,
  });

  // home=LV(28) vs away=DEN(31),  spread=4.5 → LV underdog
  await db.insert(nflGames).values({
    weekId: week2026_3.id, homeTeamId: 28, awayTeamId: 31,
    spread: "4.5", gameTime: w3FutureTime, completed: false,
  });

  // home=NYG(19) vs away=TB(32),  spread=2.5 → NYG underdog
  await db.insert(nflGames).values({
    weekId: week2026_3.id, homeTeamId: 19, awayTeamId: 32,
    spread: "2.5", gameTime: w3FutureTime, completed: false,
  });

  console.log(`  ✓ 8 games created for Week 3 (3 started at 11am ET today, 5 on March 8)\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 9: Create picks for Week 1 (all users, all with results)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 9: Creating Week 1 picks (with results)...");

  // Commish picks NE (home, spread=6.5, underdog) → NE wins → +6.5 pts
  await db.insert(userPicks).values({
    userId: "google_1771290872599_udik7s3sg", leagueId: 2,
    weekId: week2026_1.id, gameId: w1g7.id,
    pickedTeamId: 15, isUnderdog: true,
    spreadAtTimeOfPick: "6.5", won: true, pointsEarned: "6.5",
  });
  console.log("  ✓ Commish: NE +6.5 → WIN  (+6.5 pts)");

  // Alex picks KC (away, spread=7.5, underdog) → KC wins → +7.5 pts
  await db.insert(userPicks).values({
    userId: "test_user_alex", leagueId: 2,
    weekId: week2026_1.id, gameId: w1g1.id,
    pickedTeamId: 1, isUnderdog: true,
    spreadAtTimeOfPick: "7.5", won: true, pointsEarned: "7.5",
  });
  console.log("  ✓ Alex:    KC +7.5 → WIN  (+7.5 pts)");

  // Jordan picks CIN (home, spread=4.0, underdog) → CIN wins → +4.0 pts
  await db.insert(userPicks).values({
    userId: "test_user_jordan", leagueId: 2,
    weekId: week2026_1.id, gameId: w1g5.id,
    pickedTeamId: 7, isUnderdog: true,
    spreadAtTimeOfPick: "4.0", won: true, pointsEarned: "4.0",
  });
  console.log("  ✓ Jordan:  CIN +4.0 → WIN  (+4.0 pts)");

  // Sam picks PHI (home, spread=3.5, underdog) → PHI wins → +3.5 pts
  await db.insert(userPicks).values({
    userId: "test_user_sam", leagueId: 2,
    weekId: week2026_1.id, gameId: w1g3.id,
    pickedTeamId: 8, isUnderdog: true,
    spreadAtTimeOfPick: "3.5", won: true, pointsEarned: "3.5",
  });
  console.log("  ✓ Sam:     PHI +3.5 → WIN  (+3.5 pts)\n");

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 10: Create picks for Week 2 (all users, all with results)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 10: Creating Week 2 picks (with results)...");

  // Commish picks ARI (home, spread=8.5, underdog) → ARI wins → +8.5 pts  (total: 15.0)
  await db.insert(userPicks).values({
    userId: "google_1771290872599_udik7s3sg", leagueId: 2,
    weekId: week2026_2.id, gameId: w2g7.id,
    pickedTeamId: 17, isUnderdog: true,
    spreadAtTimeOfPick: "8.5", won: true, pointsEarned: "8.5",
  });
  console.log("  ✓ Commish: ARI +8.5 → WIN  (+8.5 pts, total: 15.0)");

  // Alex picks IND (home, spread=3.0, underdog) → IND wins → +3.0 pts  (total: 10.5)
  await db.insert(userPicks).values({
    userId: "test_user_alex", leagueId: 2,
    weekId: week2026_2.id, gameId: w2g2.id,
    pickedTeamId: 30, isUnderdog: true,
    spreadAtTimeOfPick: "3.0", won: true, pointsEarned: "3.0",
  });
  console.log("  ✓ Alex:    IND +3.0 → WIN  (+3.0 pts, total: 10.5)");

  // Jordan picks JAX (home, spread=7.5, underdog) → JAX wins → +7.5 pts  (total: 11.5)
  await db.insert(userPicks).values({
    userId: "test_user_jordan", leagueId: 2,
    weekId: week2026_2.id, gameId: w2g3.id,
    pickedTeamId: 22, isUnderdog: true,
    spreadAtTimeOfPick: "7.5", won: true, pointsEarned: "7.5",
  });
  console.log("  ✓ Jordan:  JAX +7.5 → WIN  (+7.5 pts, total: 11.5)");

  // Sam picks NYJ (home, spread=3.5, underdog) → NYJ wins → +3.5 pts  (total: 7.0)
  await db.insert(userPicks).values({
    userId: "test_user_sam", leagueId: 2,
    weekId: week2026_2.id, gameId: w2g6.id,
    pickedTeamId: 16, isUnderdog: true,
    spreadAtTimeOfPick: "3.5", won: true, pointsEarned: "3.5",
  });
  console.log("  ✓ Sam:     NYJ +3.5 → WIN  (+3.5 pts, total: 7.0)\n");

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 11: Commish's Week 3 pick — on an already-started game (tests pick lock UI)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Step 11: Creating Commish's Week 3 pick (on started game)...");

  // Commish picks SF (away, spread=3.5, underdog) from KC vs SF game — kicked off at 11am ET
  await db.insert(userPicks).values({
    userId: "google_1771290872599_udik7s3sg", leagueId: 2,
    weekId: week2026_3.id, gameId: w3g1.id,
    pickedTeamId: 2, isUnderdog: true,
    spreadAtTimeOfPick: "3.5", won: null, pointsEarned: null,
  });
  console.log("  ✓ Commish: SF +3.5 → PENDING (game already started — pick lock UI test)\n");

  // ─────────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("=== Seeding complete! ===\n");
  console.log("2025 ARCHIVED LEAGUE (League 1):");
  console.log("  Commish: 6.0 pts (Week 1 pick, NYG +6.0, won)\n");
  console.log("2026 ACTIVE LEAGUE (League 2) — standings after Weeks 1 & 2:");
  console.log("  Commish:     15.0 pts  (NE +6.5 W1 + ARI +8.5 W2)");
  console.log("  PoolerJordan: 11.5 pts  (CIN +4.0 W1 + JAX +7.5 W2)");
  console.log("  PoolerAlex:   10.5 pts  (KC  +7.5 W1 + IND +3.0 W2)");
  console.log("  PoolerSam:     7.0 pts  (PHI +3.5 W1 + NYJ +3.5 W2)");
  console.log("\nWeek 3 is open. Commish has a locked pick on SF +3.5 (KC vs SF started).");

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
