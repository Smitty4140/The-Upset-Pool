import { Pool } from '@neondatabase/serverless';
import fetch from 'node-fetch';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Real NFL Week 1 2025 schedule
const week1Games = [
  // Thursday Night Football - Sept 5
  { away: "Dallas Cowboys", home: "Philadelphia Eagles", time: "2025-09-05T00:20:00.000Z", spread: -3.0 },
  
  // Friday Night Football - Sept 6  
  { away: "Kansas City Chiefs", home: "Los Angeles Chargers", time: "2025-09-06T00:00:00.000Z", spread: -4.0 },
  
  // Sunday 1PM ET Games - Sept 7
  { away: "Arizona Cardinals", home: "New Orleans Saints", time: "2025-09-07T17:00:00.000Z", spread: -3.5 },
  { away: "Tampa Bay Buccaneers", home: "Atlanta Falcons", time: "2025-09-07T17:00:00.000Z", spread: -2.5 },
  { away: "Carolina Panthers", home: "Jacksonville Jaguars", time: "2025-09-07T17:00:00.000Z", spread: -1.0 },
  { away: "Cincinnati Bengals", home: "Cleveland Browns", time: "2025-09-07T17:00:00.000Z", spread: -2.0 },
  { away: "Miami Dolphins", home: "Indianapolis Colts", time: "2025-09-07T17:00:00.000Z", spread: -1.5 },
  { away: "Las Vegas Raiders", home: "New England Patriots", time: "2025-09-07T17:00:00.000Z", spread: -3.0 },
  { away: "New York Giants", home: "Washington Commanders", time: "2025-09-07T17:00:00.000Z", spread: -2.5 },
  { away: "Pittsburgh Steelers", home: "New York Jets", time: "2025-09-07T17:00:00.000Z", spread: -1.0 },
  
  // Sunday 4PM ET Games - Sept 7
  { away: "Tennessee Titans", home: "Denver Broncos", time: "2025-09-07T20:05:00.000Z", spread: -3.5 },
  { away: "San Francisco 49ers", home: "Seattle Seahawks", time: "2025-09-07T20:05:00.000Z", spread: -3.0 },
  { away: "Detroit Lions", home: "Green Bay Packers", time: "2025-09-07T20:25:00.000Z", spread: -2.5 },
  { away: "Houston Texans", home: "Los Angeles Rams", time: "2025-09-07T20:25:00.000Z", spread: -1.5 },
  
  // Sunday Night Football - Sept 7
  { away: "Baltimore Ravens", home: "Buffalo Bills", time: "2025-09-08T00:20:00.000Z", spread: -2.5 },
  
  // Monday Night Football - Sept 8
  { away: "Minnesota Vikings", home: "Chicago Bears", time: "2025-09-09T00:15:00.000Z", spread: -1.0 }
];

async function getTeamIdByName(client, teamName) {
  const result = await client.query(
    'SELECT id FROM nfl_teams WHERE name = $1',
    [teamName]
  );
  return result.rows[0]?.id;
}

async function fixNFLSchedule() {
  const client = await pool.connect();
  
  try {
    console.log('Starting NFL Week 1 schedule fix...');
    
    // Insert accurate Week 1 games
    for (const game of week1Games) {
      const homeTeamId = await getTeamIdByName(client, game.home);
      const awayTeamId = await getTeamIdByName(client, game.away);
      
      if (!homeTeamId || !awayTeamId) {
        console.log(`Warning: Could not find team IDs for ${game.away} @ ${game.home}`);
        continue;
      }
      
      await client.query(`
        INSERT INTO nfl_games (week_id, home_team_id, away_team_id, game_time, spread, completed)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [1, homeTeamId, awayTeamId, game.time, game.spread, false]);
      
      console.log(`Added: ${game.away} @ ${game.home} (${new Date(game.time).toLocaleString()})`);
    }
    
    // Verify the count
    const countResult = await client.query('SELECT COUNT(*) FROM nfl_games WHERE week_id = 1');
    console.log(`\nWeek 1 now has ${countResult.rows[0].count} games (should be 16)`);
    
    console.log('NFL Week 1 schedule fix completed successfully!');
    
  } catch (error) {
    console.error('Error fixing NFL schedule:', error);
  } finally {
    client.release();
  }
}

fixNFLSchedule();