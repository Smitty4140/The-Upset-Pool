import { db } from './db.js';
import { nflGames } from '../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import type { IStorage } from './storage.js';

/**
 * Pull NFL game data and spreads from The Odds API
 * This function is called both by the manual admin button and by the scheduler
 */
export async function pullNFLGamesFromOddsAPI(storage: IStorage, weekId?: number) {
  try {
    console.log('[NFLDataPuller] Starting NFL games data pull...');
    
    // Get the target week (either specified or current active week)
    let targetWeek;
    if (weekId) {
      const allWeeks = await storage.getNFLWeeks();
      targetWeek = allWeeks.find(w => w.id === weekId);
      if (!targetWeek) {
        throw new Error(`Week ID ${weekId} not found`);
      }
    } else {
      targetWeek = await storage.getCurrentNFLWeek();
      if (!targetWeek) {
        throw new Error('No active NFL week found');
      }
    }
    
    console.log(`[NFLDataPuller] Pulling data for Week ${targetWeek.weekNumber}`);
    
    if (!process.env.THE_ODDS_API_KEY) {
      throw new Error('The Odds API key is not configured');
    }
    
    // Fetch games from The Odds API
    const apiKey = process.env.THE_ODDS_API_KEY;
    const response = await fetch(
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?regions=us&markets=spreads&apiKey=${apiKey}&bookmakers=draftkings`
    );
    
    if (!response.ok) {
      throw new Error(`Error from The Odds API: ${response.statusText} (${response.status})`);
    }
    
    const oddsData = await response.json();
    console.log(`[NFLDataPuller] Successfully fetched ${oddsData.length} NFL games from The Odds API`);
    
    // Get all NFL teams for reference
    const teams = await storage.getNFLTeams();
    
    // Track results
    const results = {
      gamesFound: oddsData.length,
      gamesCreated: 0,
      gamesUpdated: 0,
      errors: 0
    };
    
    // Create team name lookup for faster access
    const teamNameMap = new Map();
    teams.forEach(team => {
      teamNameMap.set(team.name.toLowerCase(), team);
    });
    
    // Process each game from the API
    for (const game of oddsData) {
      try {
        // Extract the DraftKings spread information
        const draftKings = game.bookmakers.find((b: any) => b.key === 'draftkings');
        const bookmaker = draftKings || game.bookmakers[0]; // Fallback to first bookmaker if DraftKings not found
        
        if (!bookmaker) {
          console.log(`[NFLDataPuller] No bookmaker data for game: ${game.home_team} vs ${game.away_team}`);
          results.errors++;
          continue;
        }
        
        const spreadsMarket = bookmaker.markets.find((m: any) => m.key === 'spreads');
        if (!spreadsMarket) {
          console.log(`[NFLDataPuller] No spreads market for game: ${game.home_team} vs ${game.away_team}`);
          results.errors++;
          continue;
        }
        
        const homeOutcome = spreadsMarket.outcomes.find((o: any) => o.name === game.home_team);
        if (!homeOutcome) {
          console.log(`[NFLDataPuller] No home team outcome for game: ${game.home_team} vs ${game.away_team}`);
          results.errors++;
          continue;
        }
        
        const homeSpread = parseFloat(homeOutcome.point) || 0;
        console.log(`[NFLDataPuller] Game: ${game.home_team} vs ${game.away_team}, Spread: ${homeSpread}`);
        
        // Find team IDs
        const homeTeam = teamNameMap.get(game.home_team.toLowerCase());
        const awayTeam = teamNameMap.get(game.away_team.toLowerCase());
        
        if (!homeTeam) {
          console.log(`[NFLDataPuller] Home team not found: ${game.home_team}`);
          results.errors++;
          continue;
        }
        
        if (!awayTeam) {
          console.log(`[NFLDataPuller] Away team not found: ${game.away_team}`);
          results.errors++;
          continue;
        }
        
        // Check if game exists
        const existingGames = await db.select().from(nflGames).where(
          and(
            eq(nflGames.weekId, targetWeek.id),
            eq(nflGames.homeTeamId, homeTeam.id),
            eq(nflGames.awayTeamId, awayTeam.id)
          )
        );
        
        if (existingGames.length > 0) {
          // Update existing game
          const gameId = existingGames[0].id;
          await db.update(nflGames)
            .set({
              spread: homeSpread.toString(),
              gameTime: new Date(game.commence_time),
              updatedAt: new Date()
            })
            .where(eq(nflGames.id, gameId));
          
          console.log(`[NFLDataPuller] Updated game ID ${gameId}: ${homeTeam.name} vs ${awayTeam.name}`);
          results.gamesUpdated++;
        } else {
          // Create new game
          const [newGame] = await db.insert(nflGames).values({
            weekId: targetWeek.id,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            spread: homeSpread.toString(),
            homeTeamRecord: "0-0",
            awayTeamRecord: "0-0",
            gameTime: new Date(game.commence_time),
            completed: false
          }).returning();
          
          console.log(`[NFLDataPuller] Created game ID ${newGame.id}: ${homeTeam.name} vs ${awayTeam.name}`);
          results.gamesCreated++;
        }
      } catch (error) {
        console.error(`[NFLDataPuller] Error processing game ${game.home_team} vs ${game.away_team}:`, error);
        results.errors++;
      }
    }
    
    console.log(`[NFLDataPuller] ✅ NFL games sync completed for Week ${targetWeek.weekNumber}:`, results);
    return {
      success: true,
      weekNumber: targetWeek.weekNumber,
      results
    };
    
  } catch (error) {
    console.error('[NFLDataPuller] ❌ Error syncing NFL games:', error);
    throw error;
  }
}
