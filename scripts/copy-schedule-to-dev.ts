import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '../shared/schema.js';
import { eq, sql } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

const prodPool = new Pool({ connectionString: process.env.DATABASE_URL });
const prodDb = drizzle({ client: prodPool, schema });

const devPool = new Pool({ connectionString: process.env.DEV_DATABASE_URL });
const devDb = drizzle({ client: devPool, schema });

async function copySchedule() {
  try {
    console.log('Step 1: Copying NFL teams from production...');
    const prodTeams = await prodDb.select().from(schema.nflTeams);
    console.log(`Found ${prodTeams.length} teams in production`);

    await devDb.delete(schema.nflGames);
    await devDb.delete(schema.nflWeeks);
    await devDb.delete(schema.nflTeams);
    console.log('Cleared existing dev data');

    const devCols = await devDb.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'nfl_teams'`);
    const colNames = devCols.rows.map((r: any) => r.column_name);
    console.log(`Dev nfl_teams columns: ${colNames.join(', ')}`);
    const hasCity = colNames.includes('city');

    for (const team of prodTeams) {
      if (hasCity) {
        await devDb.execute(sql`INSERT INTO nfl_teams (id, name, abbreviation, city, logo_url, primary_color, secondary_color) VALUES (${team.id}, ${team.name}, ${team.abbreviation}, ${team.city || null}, ${team.logoUrl || ''}, ${team.primaryColor || null}, ${team.secondaryColor || null})`);
      } else {
        await devDb.execute(sql`INSERT INTO nfl_teams (id, name, abbreviation, logo_url, primary_color, secondary_color) VALUES (${team.id}, ${team.name}, ${team.abbreviation}, ${team.logoUrl || ''}, ${team.primaryColor || null}, ${team.secondaryColor || null})`);
      }
    }
    await devDb.execute(sql`SELECT setval('nfl_teams_id_seq', (SELECT MAX(id) FROM nfl_teams))`);
    console.log(`Inserted ${prodTeams.length} teams into dev`);

    console.log('\nStep 2: Reading Week 1 data from production...');
    const prodWeeks = await prodDb.select().from(schema.nflWeeks).where(eq(schema.nflWeeks.weekNumber, 1));

    if (prodWeeks.length === 0) {
      console.log('No Week 1 found in production!');
      return;
    }

    const prodWeek = prodWeeks[0];
    console.log(`Found Week 1 (ID: ${prodWeek.id}, Season: ${prodWeek.season})`);

    const prodGames = await prodDb.select().from(schema.nflGames).where(eq(schema.nflGames.weekId, prodWeek.id));
    console.log(`Found ${prodGames.length} games in Week 1`);

    const now = new Date();
    const currentDayOfWeek = now.getUTCDay();
    const daysUntilSunday = (7 - currentDayOfWeek) % 7;
    const nextSunday = new Date(now);
    nextSunday.setUTCDate(now.getUTCDate() + (daysUntilSunday === 0 && now.getUTCHours() < 23 ? 0 : daysUntilSunday));
    nextSunday.setUTCHours(17, 0, 0, 0);

    const nextThursday = new Date(nextSunday);
    nextThursday.setUTCDate(nextSunday.getUTCDate() - 3);
    nextThursday.setUTCHours(0, 15, 0, 0);

    const nextMonday = new Date(nextSunday);
    nextMonday.setUTCDate(nextSunday.getUTCDate() + 1);
    nextMonday.setUTCHours(0, 15, 0, 0);

    const weekStart = new Date(nextThursday);
    weekStart.setUTCDate(weekStart.getUTCDate() - 1);
    const weekEnd = new Date(nextMonday);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 1);

    const lockTime = new Date(nextSunday);

    console.log(`\nStep 3: Adjusting dates for this week:`);
    console.log(`  Week start: ${weekStart.toISOString()}`);
    console.log(`  Week end: ${weekEnd.toISOString()}`);
    console.log(`  Picks lock at: ${lockTime.toISOString()} (Sunday 1 PM ET / 5 PM UTC)`);

    const [newWeek] = await devDb.insert(schema.nflWeeks).values({
      weekNumber: 1,
      season: 2025,
      startDate: weekStart,
      endDate: weekEnd,
      picksLockAt: lockTime,
    }).returning();

    console.log(`Created Week 1 in dev (ID: ${newWeek.id})`);

    let gamesInserted = 0;
    for (const game of prodGames) {
      const origTime = new Date(game.gameTime);
      const origDay = origTime.getUTCDay();
      const origHours = origTime.getUTCHours();
      const origMinutes = origTime.getUTCMinutes();

      let newGameTime: Date;

      if (origDay === 4) {
        newGameTime = new Date(nextThursday);
        newGameTime.setUTCHours(origHours, origMinutes, 0, 0);
      } else if (origDay === 1) {
        newGameTime = new Date(nextMonday);
        newGameTime.setUTCHours(origHours, origMinutes, 0, 0);
      } else {
        newGameTime = new Date(nextSunday);
        newGameTime.setUTCHours(origHours, origMinutes, 0, 0);
      }

      await devDb.insert(schema.nflGames).values({
        weekId: newWeek.id,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        gameTime: newGameTime,
        spread: game.spread,
        homeTeamScore: null,
        awayTeamScore: null,
        completed: false,
        winningTeamId: null,
      });
      gamesInserted++;
    }

    console.log(`\nInserted ${gamesInserted} games into dev database`);
    console.log('Done! Dev database now has Week 1 scheduled for this week.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

copySchedule();
