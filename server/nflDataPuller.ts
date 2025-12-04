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
    
    // Get all NFL weeks to match games to the correct week
    const allWeeks = await storage.getNFLWeeks();
    
    // If a specific week is provided, validate it exists
    if (weekId) {
      const targetWeek = allWeeks.find(w => w.id === weekId);
      if (!targetWeek) {
        throw new Error(`Week ID ${weekId} not found`);
      }
    }
    
    console.log(`[NFLDataPuller] Pulling data for all upcoming games...`);
    
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
    
    // Helper function to find the correct week for a game based on its commence time
    function findWeekForGame(gameTime: Date): typeof allWeeks[0] | null {
      const gameDate = new Date(gameTime);
      // Use date string comparison (YYYY-MM-DD format)
      const gameDateStr = gameDate.toISOString().split('T')[0];
      
      for (const week of allWeeks) {
        // Convert dates to string format for comparison
        const startDateStr = new Date(week.startDate).toISOString().split('T')[0];
        const endDateStr = new Date(week.endDate).toISOString().split('T')[0];
        
        // Check if game date falls within week's date range
        if (gameDateStr >= startDateStr && gameDateStr <= endDateStr) {
          return week;
        }
      }
      return null;
    }
    
    // Process each game from the API
    for (const game of oddsData) {
      try {
        // Determine which week this game belongs to
        const gameTime = new Date(game.commence_time);
        const gameWeek = findWeekForGame(gameTime);
        
        if (!gameWeek) {
          console.log(`[NFLDataPuller] Could not find week for game at ${gameTime}: ${game.home_team} vs ${game.away_team}`);
          results.errors++;
          continue;
        }
        
        // If a specific weekId was provided, only process games from that week
        if (weekId && gameWeek.id !== weekId) {
          continue;
        }
        
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
        console.log(`[NFLDataPuller] Game: ${game.home_team} vs ${game.away_team}, Spread: ${homeSpread}, Week: ${gameWeek.weekNumber}`);
        
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
        
        // Check if game exists in the correct week
        const existingGames = await db.select().from(nflGames).where(
          and(
            eq(nflGames.weekId, gameWeek.id),
            eq(nflGames.homeTeamId, homeTeam.id),
            eq(nflGames.awayTeamId, awayTeam.id)
          )
        );
        
        if (existingGames.length > 0) {
          // Update existing game
          const gameId = existingGames[0].id;
          const existingGame = existingGames[0];
          
          // Only update spread if it hasn't been set yet (is 0)
          // Once spreads are pulled from The Odds API, they should never be updated
          const updateObj: any = {
            gameTime: gameTime,
            updatedAt: new Date()
          };
          
          // Convert spread to number for comparison (handles both string "0.0" and numeric 0)
          const existingSpread = parseFloat(String(existingGame.spread)) || 0;
          if (existingSpread === 0) {
            updateObj.spread = homeSpread.toString();
          }
          
          await db.update(nflGames)
            .set(updateObj)
            .where(eq(nflGames.id, gameId));
          
          const updateMsg = updateObj.spread ? ` with spread ${homeSpread}` : ' (spread already set, keeping existing)';
          console.log(`[NFLDataPuller] Updated game ID ${gameId}: ${homeTeam.name} vs ${awayTeam.name}${updateMsg}`);
          results.gamesUpdated++;
        } else {
          // Create new game
          const [newGame] = await db.insert(nflGames).values({
            weekId: gameWeek.id,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            spread: homeSpread.toString(),
            homeTeamRecord: "0-0",
            awayTeamRecord: "0-0",
            gameTime: gameTime,
            completed: false
          }).returning();
          
          console.log(`[NFLDataPuller] Created game ID ${newGame.id}: ${homeTeam.name} vs ${awayTeam.name} in Week ${gameWeek.weekNumber}`);
          results.gamesCreated++;
        }
      } catch (error) {
        console.error(`[NFLDataPuller] Error processing game ${game.home_team} vs ${game.away_team}:`, error);
        results.errors++;
      }
    }
    
    console.log(`[NFLDataPuller] ✅ NFL games sync completed:`, results);
    return {
      success: true,
      results
    };
    
  } catch (error) {
    console.error('[NFLDataPuller] ❌ Error syncing NFL games:', error);
    throw error;
  }
}
