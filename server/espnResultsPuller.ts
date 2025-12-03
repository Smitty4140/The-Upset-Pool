import { db } from './db.js';
import { nflGames } from '../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import type { IStorage } from './storage.js';

/**
 * Pull NFL game results from ESPN API
 * This function is called both by the manual admin button and by the scheduler
 */
export async function pullNFLResultsFromESPN(storage: IStorage, weekId: number) {
  try {
    console.log(`[ESPNResultsPuller] Starting results pull for week ID ${weekId}...`);
    
    // Get the week
    const week = await storage.getNFLWeek(weekId);
    if (!week) {
      throw new Error(`NFL week ID ${weekId} not found`);
    }
    
    // Get current season year
    const currentYear = new Date().getFullYear();
    
    // Fetch game results from ESPN API
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${currentYear}&seasontype=2&week=${week.weekNumber}`;
    console.log(`[ESPNResultsPuller] Fetching from ESPN: ${espnUrl}`);
    
    const response = await fetch(espnUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from ESPN API: ${response.statusText} (${response.status})`);
    }
    
    const espnData = await response.json();
    console.log(`[ESPNResultsPuller] Successfully fetched ${espnData.events?.length || 0} games from ESPN`);
    
    // Get NFL teams for mapping
    const teams = await storage.getNFLTeams();
    const teamNameMap = new Map();
    teams.forEach(team => {
      teamNameMap.set(team.name.toLowerCase(), team);
      // Also add common ESPN variations
      if (team.abbreviation) {
        teamNameMap.set(team.abbreviation.toLowerCase(), team);
      }
    });
    
    // Track results
    const results = {
      gamesFound: espnData.events?.length || 0,
      gamesUpdated: 0,
      gamesCompleted: 0,
      gamesInProgress: 0,
      errors: 0
    };
    
    // Process each game from ESPN
    for (const event of espnData.events || []) {
      try {
        const competition = event.competitions[0];
        const homeTeam = competition.competitors.find((c: any) => c.homeAway === 'home');
        const awayTeam = competition.competitors.find((c: any) => c.homeAway === 'away');
        
        if (!homeTeam || !awayTeam) {
          console.log(`[ESPNResultsPuller] Missing team data for game: ${event.name}`);
          results.errors++;
          continue;
        }
        
        // Find teams in our database
        const dbHomeTeam = teamNameMap.get(homeTeam.team.displayName.toLowerCase()) || 
                         teamNameMap.get(homeTeam.team.abbreviation.toLowerCase());
        const dbAwayTeam = teamNameMap.get(awayTeam.team.displayName.toLowerCase()) || 
                         teamNameMap.get(awayTeam.team.abbreviation.toLowerCase());
        
        if (!dbHomeTeam || !dbAwayTeam) {
          console.log(`[ESPNResultsPuller] Teams not found in database: ${homeTeam.team.displayName} vs ${awayTeam.team.displayName}`);
          results.errors++;
          continue;
        }
        
        // Check if game is completed
        if (competition.status.type.completed) {
          const homeScore = parseInt(homeTeam.score);
          const awayScore = parseInt(awayTeam.score);
          const winningTeamId = homeScore > awayScore ? dbHomeTeam.id : dbAwayTeam.id;
          
          // Find the game in our database
          const existingGames = await db.select().from(nflGames).where(
            and(
              eq(nflGames.weekId, week.id),
              eq(nflGames.homeTeamId, dbHomeTeam.id),
              eq(nflGames.awayTeamId, dbAwayTeam.id)
            )
          );
          
          if (existingGames.length > 0) {
            const gameId = existingGames[0].id;
            const wasAlreadyCompleted = existingGames[0].completed;
            
            // Update game with results
            await db.update(nflGames)
              .set({
                homeTeamScore: homeScore,
                awayTeamScore: awayScore,
                completed: true,
                winningTeamId: winningTeamId,
                updatedAt: new Date()
              })
              .where(eq(nflGames.id, gameId));
            
            console.log(`[ESPNResultsPuller] Updated game: ${dbHomeTeam.name} ${homeScore} - ${awayScore} ${dbAwayTeam.name}`);
            
            // Process user picks for this game (calculates points)
            await storage.processGameResults(gameId);
            results.gamesUpdated++;
            
            if (!wasAlreadyCompleted) {
              results.gamesCompleted++;
            }
          } else {
            console.log(`[ESPNResultsPuller] Game not found in database: ${dbHomeTeam.name} vs ${dbAwayTeam.name}`);
            results.errors++;
          }
        } else if (competition.status.type.state === 'in') {
          results.gamesInProgress++;
        }
      } catch (error) {
        console.error(`[ESPNResultsPuller] Error processing game result:`, error);
        results.errors++;
      }
    }
    
    console.log(`[ESPNResultsPuller] ✅ Results pull completed for Week ${week.weekNumber}:`, results);
    return {
      success: true,
      weekNumber: week.weekNumber,
      results
    };
    
  } catch (error) {
    console.error('[ESPNResultsPuller] ❌ Error pulling results:', error);
    throw error;
  }
}

/**
 * Pull results for all active weeks (used by scheduler for hourly pulls)
 */
export async function pullResultsForActiveWeeks(storage: IStorage) {
  try {
    console.log('[ESPNResultsPuller] Starting results pull for all active weeks...');
    
    // Get all NFL weeks
    const weeks = await storage.getNFLWeeks();
    const now = new Date();
    
    // Find weeks that are currently in progress (started but not ended)
    const activeWeeks = weeks.filter(week => {
      const startDate = new Date(week.startDate);
      const endDate = new Date(week.endDate);
      // Add a day buffer after endDate for Monday night games
      endDate.setDate(endDate.getDate() + 1);
      return startDate <= now && now <= endDate;
    });
    
    console.log(`[ESPNResultsPuller] Found ${activeWeeks.length} active weeks to check`);
    
    const allResults = [];
    
    for (const week of activeWeeks) {
      try {
        const result = await pullNFLResultsFromESPN(storage, week.id);
        allResults.push(result);
      } catch (error) {
        console.error(`[ESPNResultsPuller] Error pulling results for week ${week.weekNumber}:`, error);
      }
    }
    
    return {
      success: true,
      weeksProcessed: allResults.length,
      results: allResults
    };
    
  } catch (error) {
    console.error('[ESPNResultsPuller] ❌ Error in batch results pull:', error);
    throw error;
  }
}
