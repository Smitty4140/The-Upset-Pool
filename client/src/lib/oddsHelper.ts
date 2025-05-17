import { NFLGame } from "./types";
import { getTeamLogo } from "./teamLogos";

type Bookmaker = {
  key: string;
  title: string;
  last_update: string;
  markets: {
    key: string;
    last_update: string;
    outcomes: {
      name: string;
      price: number;
    }[];
  }[];
};

type OddsGame = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
};

// Convert American odds to spread
export function getSpreadFromOdds(homeOdds: number, awayOdds: number): number {
  if (homeOdds < 0 && awayOdds > 0) {
    // Home team is favored
    return parseFloat((Math.round(-homeOdds / 100 * 2.5 * 2) / 2).toFixed(1));
  } else if (awayOdds < 0 && homeOdds > 0) {
    // Away team is favored
    return parseFloat((-Math.round(-awayOdds / 100 * 2.5 * 2) / 2).toFixed(1));
  }
  return 0;
}

// Convert an API odds game to our application's NFLGame format
export function convertOddsToNFLGame(game: OddsGame, weekId: number): NFLGame | null {
  if (!game.bookmakers || game.bookmakers.length === 0) return null;
  
  const mainBookmaker = game.bookmakers[0];
  const h2hMarket = mainBookmaker.markets.find(m => m.key === 'h2h');
  
  if (!h2hMarket || h2hMarket.outcomes.length < 2) return null;
  
  const homeOutcome = h2hMarket.outcomes.find(o => o.name === game.home_team);
  const awayOutcome = h2hMarket.outcomes.find(o => o.name === game.away_team);
  
  if (!homeOutcome || !awayOutcome) return null;
  
  // Calculate spread from American odds
  const spread = getSpreadFromOdds(homeOutcome.price, awayOutcome.price);
  
  // Generate a stable numeric ID from the string ID
  const gameId = parseInt(game.id.substring(0, 8), 16) % 1000000;
  
  // Create synthetic team objects
  const homeTeam = {
    id: gameId * 2, // Use a deterministic formula to generate stable IDs
    name: game.home_team,
    abbreviation: getTeamAbbreviation(game.home_team),
    logoUrl: getTeamLogo(getTeamAbbreviation(game.home_team)),
    primaryColor: null,
    secondaryColor: null
  };
  
  const awayTeam = {
    id: gameId * 2 + 1, // Different ID from home team
    name: game.away_team,
    abbreviation: getTeamAbbreviation(game.away_team),
    logoUrl: getTeamLogo(getTeamAbbreviation(game.away_team)),
    primaryColor: null,
    secondaryColor: null
  };
  
  // Convert to NFLGame format
  return {
    id: gameId,
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
  };
}

// Get the team abbreviation from the full name
function getTeamAbbreviation(teamName: string): string {
  // Map of NFL team names to abbreviations
  const teamMap: Record<string, string> = {
    "Arizona Cardinals": "ARI",
    "Atlanta Falcons": "ATL",
    "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF",
    "Carolina Panthers": "CAR",
    "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN",
    "Cleveland Browns": "CLE",
    "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN",
    "Detroit Lions": "DET",
    "Green Bay Packers": "GB",
    "Houston Texans": "HOU",
    "Indianapolis Colts": "IND",
    "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC",
    "Las Vegas Raiders": "LV",
    "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR",
    "Miami Dolphins": "MIA",
    "Minnesota Vikings": "MIN",
    "New England Patriots": "NE",
    "New Orleans Saints": "NO",
    "New York Giants": "NYG",
    "New York Jets": "NYJ",
    "Philadelphia Eagles": "PHI",
    "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA",
    "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN",
    "Washington Commanders": "WAS"
  };
  
  return teamMap[teamName] || teamName.substring(0, 3).toUpperCase();
}

// Convert all odds games to our app format
export function convertOddsGamesToNFLGames(oddsData: OddsGame[], weekId: number): NFLGame[] {
  if (!oddsData || oddsData.length === 0) return [];
  
  const nflGames: NFLGame[] = [];
  
  for (const game of oddsData) {
    const nflGame = convertOddsToNFLGame(game, weekId);
    if (nflGame) {
      nflGames.push(nflGame);
    }
  }
  
  return nflGames;
}