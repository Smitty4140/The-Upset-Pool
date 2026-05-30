import { db } from "../server/db";
import { golfTournaments, golfPlayers, golfTournamentField, golfResults } from "../shared/schema";
import { eq, and } from "drizzle-orm";

// Realistic US Open finishing order — a couple upsets sprinkled in
const FINISHING_ORDER = [
  { name: "Bryson DeChambeau",  position: 1  },  // defending champ repeats!
  { name: "Rory McIlroy",       position: 2  },
  { name: "Tommy Fleetwood",    position: 3  },
  { name: "Xander Schauffele",  position: 4  },
  { name: "Shane Lowry",        position: 5  },
  { name: "Russell Henley",     position: 6  },  // big upset — longshot cashes
  { name: "Scottie Scheffler",  position: 7  },
  { name: "Matt Fitzpatrick",   position: 8  },
  { name: "Brooks Koepka",      position: 9  },
  { name: "Collin Morikawa",    position: 10 },
  { name: "Jon Rahm",           position: 11 },
  { name: "Viktor Hovland",     position: 12 },
  { name: "Patrick Cantlay",    position: 13 },
  { name: "Hideki Matsuyama",   position: 14 },
  { name: "Tom Kim",            position: 15 },
  { name: "Tony Finau",         position: 16 },
  { name: "Sam Burns",          position: 17 },
  { name: "Keegan Bradley",     position: 18 },
  { name: "Wyndham Clark",      position: "mc" as const },
  { name: "Adam Scott",         position: "mc" as const },
];

async function main() {
  // 1. Complete the tournament
  await db
    .update(golfTournaments)
    .set({ status: "completed" })
    .where(eq(golfTournaments.id, 3));
  console.log("✓ Tournament status → completed");

  // 2. Fetch all players so we can map name → id
  const players = await db.select().from(golfPlayers);
  const playerMap = new Map(players.map(p => [p.name, p.id]));

  // 3. Clear existing results for this tournament
  await db.delete(golfResults).where(eq(golfResults.tournamentId, 3));
  console.log("✓ Cleared existing results");

  // 4. Insert new results
  const rows = [];
  for (const entry of FINISHING_ORDER) {
    const playerId = playerMap.get(entry.name);
    if (!playerId) { console.warn(`  ⚠ Player not found: ${entry.name}`); continue; }

    const isMC = entry.position === "mc";
    rows.push({
      tournamentId: 3,
      playerId,
      finalPosition: isMC ? null : entry.position as number,
      status: isMC ? "mc" : "finished",
      topTen: !isMC && (entry.position as number) <= 10,
    });
  }

  await db.insert(golfResults).values(rows);
  console.log(`✓ Inserted ${rows.length} result rows`);

  // 5. Print summary
  console.log("\n=== Final Leaderboard ===");
  for (const r of rows.filter(r => r.status === "finished").sort((a,b) => (a.finalPosition??99)-(b.finalPosition??99))) {
    const name = FINISHING_ORDER.find(e => !isNaN(Number(e.position)) && (e.position as number) === r.finalPosition)?.name;
    console.log(`  ${String(r.finalPosition).padStart(2)}. ${name}${r.topTen ? " ★" : ""}`);
  }
  console.log("  MC:", FINISHING_ORDER.filter(e => e.position === "mc").map(e => e.name).join(", "));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
