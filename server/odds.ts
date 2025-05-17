import { pool } from './db';
import type { NFLGame, NFLTeam } from '@shared/schema';

export interface OddsTeam {
  name: string;
  price: number;
}

export interface OddsGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    title: string;
    last_update: string;
    markets: {
      key: string;
      last_update: string;
      outcomes: OddsTeam[];
    }[];
  }[];
}

// Function to calculate spread from American odds
export function calculateSpreadFromOdds(homeOdds: number, awayOdds: number): number {
  if (homeOdds < 0 && awayOdds > 0) {
    // Home team is favored
    return parseFloat((Math.round(-homeOdds / 100 * 2.5 * 2) / 2).toFixed(1));
  } else if (awayOdds < 0 && homeOdds > 0) {
    // Away team is favored
    return parseFloat((-Math.round(-awayOdds / 100 * 2.5 * 2) / 2).toFixed(1));
  }
  return 0;
}

// Function to fetch NFL team by name
export async function findNFLTeamByName(teamName: string): Promise<NFLTeam | null> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM nfl_teams WHERE name ILIKE $1 OR name ILIKE $2`,
      [`%${teamName}%`, `%${teamName.replace(/\s+/g, '')}%`]
    );
    
    if (rows.length > 0) {
      return rows[0];
    }
    return null;
  } catch (error) {
    console.error("Error finding NFL team by name:", error);
    return null;
  }
}

// Convert odds data to NFL games format
export async function convertOddsToNFLGames(oddsData: OddsGame[], weekId: number): Promise<Partial<NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam }>[]> {
  const games: Partial<NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam }>[] = [];
  
  for (const game of oddsData) {
    try {
      // Get the main bookmaker (first one)
      if (!game.bookmakers || game.bookmakers.length === 0) continue;
      
      const bookmaker = game.bookmakers[0];
      const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
      
      if (!h2hMarket || h2hMarket.outcomes.length < 2) continue;
      
      const homeOutcome = h2hMarket.outcomes.find(o => o.name === game.home_team);
      const awayOutcome = h2hMarket.outcomes.find(o => o.name === game.away_team);
      
      if (!homeOutcome || !awayOutcome) continue;
      
      // Find teams in the database
      const homeTeam = await findNFLTeamByName(game.home_team);
      const awayTeam = await findNFLTeamByName(game.away_team);
      
      if (!homeTeam || !awayTeam) {
        console.log(`Could not find teams for: ${game.home_team} vs ${game.away_team}`);
        continue;
      }
      
      // Calculate spread from American odds
      const spread = calculateSpreadFromOdds(homeOutcome.price, awayOutcome.price);
      
      // Convert to NFLGame format
      games.push({
        id: parseInt(game.id.substring(0, 8), 16), // Convert part of the ID to a number
        weekId,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeTeamScore: null,
        awayTeamScore: null,
        spread,
        homeTeamRecord: null,
        awayTeamRecord: null,
        gameTime: game.commence_time,
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        homeTeam,
        awayTeam
      });
    } catch (error) {
      console.error("Error converting odds game:", error);
    }
  }
  
  return games;
}