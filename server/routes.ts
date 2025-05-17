import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { z } from "zod";
import { userPickFormSchema } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { userPicks, nflGames, nflWeeks } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // NFL Teams routes
  app.get('/api/nfl-teams', async (req, res) => {
    try {
      const teams = await storage.getNFLTeams();
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch NFL teams" });
    }
  });

  // NFL Weeks routes
  app.get('/api/nfl-weeks', async (req, res) => {
    try {
      const weeks = await storage.getNFLWeeks();
      res.json(weeks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch NFL weeks" });
    }
  });

  app.get('/api/nfl-weeks/current', async (req, res) => {
    try {
      const week = await storage.getCurrentNFLWeek();
      if (!week) {
        return res.status(404).json({ message: "No active NFL week found" });
      }
      res.json(week);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch current NFL week" });
    }
  });

  // NFL Games routes
  app.get('/api/nfl-games', async (req, res) => {
    try {
      // If weekId is provided as a query parameter, use it
      if (req.query.weekId) {
        const weekIdSchema = z.object({
          weekId: z.string().transform(val => parseInt(val))
        });
        
        const { weekId } = weekIdSchema.parse(req.query);
        const games = await storage.getNFLGames(weekId);
        return res.json(games);
      }
      
      // Otherwise, get the current week and use that
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }
      
      const games = await storage.getNFLGames(currentWeek.id);
      res.json(games);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid week ID format" });
      }
      res.status(500).json({ message: "Failed to fetch games" });
    }
  });

  app.get('/api/nfl-games/underdog', async (req, res) => {
    try {
      // If weekId is provided as a query parameter, use it
      if (req.query.weekId) {
        const weekIdSchema = z.object({
          weekId: z.string().transform(val => parseInt(val))
        });
        
        const { weekId } = weekIdSchema.parse(req.query);
        const games = await storage.getUnderdogGames(weekId);
        return res.json(games);
      } 
      
      // Otherwise, get the current week and use that
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }
      
      const games = await storage.getUnderdogGames(currentWeek.id);
      res.json(games);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid week ID format" });
      }
      res.status(500).json({ message: "Failed to fetch games" });
    }
  });

  // Leagues routes
  app.get('/api/leagues', async (req, res) => {
    try {
      const leagues = await storage.getLeagues();
      res.json(leagues);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  app.get('/api/leagues/:id', async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const league = await storage.getLeague(leagueId);
      
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      res.json(league);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch league" });
    }
  });

  app.get('/api/user-leagues', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userLeagues = await storage.getUserLeagues(userId);
      res.json(userLeagues);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user leagues" });
    }
  });

  // League members routes
  app.get('/api/leagues/:id/members', async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const members = await storage.getLeagueMembers(leagueId);
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch league members" });
    }
  });

  app.post('/api/leagues/:id/members', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const member = await storage.addLeagueMember({
        leagueId,
        userId,
        isAdmin: false,
      });
      
      res.json(member);
    } catch (error) {
      res.status(500).json({ message: "Failed to add league member" });
    }
  });

  // User picks routes
  app.get('/api/user-pick', isAuthenticated, async (req: any, res) => {
    const querySchema = z.object({
      weekId: z.string().transform(val => parseInt(val)),
      leagueId: z.string().transform(val => parseInt(val)),
    });

    try {
      const { weekId, leagueId } = querySchema.parse(req.query);
      const userId = req.user.claims.sub;
      
      const userPick = await storage.getUserPick(userId, weekId, leagueId);
      res.json(userPick || null);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid query parameters", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to fetch user pick" });
    }
  });

  app.post('/api/user-pick', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const pickData = userPickFormSchema.parse(req.body);
      
      // Check if the week is still open for picks
      const week = await storage.getNFLWeek(pickData.weekId);
      if (!week) {
        return res.status(404).json({ message: "NFL week not found" });
      }
      
      const now = new Date();
      if (now >= week.picksLockAt) {
        return res.status(400).json({ message: "Picks are locked for this week" });
      }
      
      // Check if the game exists and get its details
      const game = await storage.getNFLGame(pickData.gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      
      // Check if the game has already started
      if (now >= game.gameTime) {
        return res.status(400).json({ message: "Game has already started, can't pick" });
      }
      
      // Determine if the picked team is an underdog
      const isHomeTeamUnderdog = Number(game.spread) > 0;
      const isAwayTeamUnderdog = Number(game.spread) < 0;
      const isPickedTeamUnderdog = 
        (pickData.pickedTeamId === game.homeTeamId && isHomeTeamUnderdog) ||
        (pickData.pickedTeamId === game.awayTeamId && isAwayTeamUnderdog);
      
      if (!isPickedTeamUnderdog) {
        return res.status(400).json({ message: "Selected team is not an underdog" });
      }
      
      // Check if user already has a pick for this week and league
      const existingPick = await storage.getUserPick(userId, pickData.weekId, pickData.leagueId);
      
      if (existingPick) {
        // Update existing pick
        const updatedPick = await storage.updateUserPick(existingPick.id, {
          gameId: pickData.gameId,
          pickedTeamId: pickData.pickedTeamId,
          isUnderdog: isPickedTeamUnderdog,
          spreadAtTimeOfPick: game.spread,
          updatedAt: new Date(),
        });
        return res.json(updatedPick);
      } else {
        // Create new pick
        const newPick = await storage.createUserPick({
          userId,
          leagueId: pickData.leagueId,
          weekId: pickData.weekId,
          gameId: pickData.gameId,
          pickedTeamId: pickData.pickedTeamId,
          isUnderdog: isPickedTeamUnderdog,
          spreadAtTimeOfPick: game.spread,
        });
        return res.status(201).json(newPick);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid pick data", errors: error.errors });
      }
      console.error("Error creating user pick:", error);
      res.status(500).json({ message: "Failed to create user pick" });
    }
  });

  app.get('/api/league/:id/picks', async (req, res) => {
    const querySchema = z.object({
      weekId: z.string().transform(val => parseInt(val)),
    });

    try {
      const leagueId = parseInt(req.params.id);
      const { weekId } = querySchema.parse(req.query);
      
      const picks = await storage.getUserPicksForWeek(weekId, leagueId);
      res.json(picks);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid query parameters", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to fetch league picks" });
    }
  });

  // Leaderboard route
  app.get('/api/league/:id/leaderboard', async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const leaderboard = await storage.getLeaderboard(leagueId);
      res.json(leaderboard);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });
  
  // NFL Odds API route
  app.get('/api/nfl-odds', async (req, res) => {
    try {
      const apiKey = 'c274aaa90f619f58e8303e73c3a51870'; // Using the provided API key
      const response = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&oddsFormat=american&apiKey=${apiKey}`);
      
      if (!response.ok) {
        throw new Error(`Odds API returned status: ${response.status}`);
      }
      
      const oddsData = await response.json();
      res.json(oddsData);
    } catch (error) {
      console.error("Error fetching NFL odds:", error);
      res.status(500).json({ message: "Failed to fetch NFL odds" });
    }
  });
  
  // NFL Odds Games route - get games from The Odds API in the app's format
  app.get('/api/odds-games', async (req, res) => {
    try {
      const apiKey = 'c274aaa90f619f58e8303e73c3a51870'; // Using the provided API key
      // Use the spreads market to get actual point spreads
      const response = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=spreads&oddsFormat=american&apiKey=${apiKey}`);
      
      if (!response.ok) {
        throw new Error(`Odds API returned status: ${response.status}`);
      }
      
      // Get the current week
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }
      
      const oddsData = await response.json();
      
      // Filter to only include Week 1 games for the 2025 NFL season
      // If we knew the exact commence_time range for Week 1, we could filter here
      
      // Create a team name mapping for ESPN logo compatibility
      const teamNameToAbbreviation: Record<string, string> = {
        "Arizona Cardinals": "ari",
        "Atlanta Falcons": "atl", 
        "Baltimore Ravens": "bal",
        "Buffalo Bills": "buf",
        "Carolina Panthers": "car",
        "Chicago Bears": "chi",
        "Cincinnati Bengals": "cin",
        "Cleveland Browns": "cle",
        "Dallas Cowboys": "dal",
        "Denver Broncos": "den",
        "Detroit Lions": "det",
        "Green Bay Packers": "gb",
        "Houston Texans": "hou",
        "Indianapolis Colts": "ind",
        "Jacksonville Jaguars": "jax",
        "Kansas City Chiefs": "kc",
        "Las Vegas Raiders": "lv",
        "Los Angeles Chargers": "lac",
        "Los Angeles Rams": "lar",
        "Miami Dolphins": "mia",
        "Minnesota Vikings": "min",
        "New England Patriots": "ne",
        "New Orleans Saints": "no",
        "New York Giants": "nyg",
        "New York Jets": "nyj",
        "Philadelphia Eagles": "phi",
        "Pittsburgh Steelers": "pit",
        "San Francisco 49ers": "sf",
        "Seattle Seahawks": "sea",
        "Tampa Bay Buccaneers": "tb",
        "Tennessee Titans": "ten",
        "Washington Commanders": "wsh"
      };

      // Synthetic team colors for better visual appeal
      const teamColors: Record<string, [string, string]> = {
        "ari": ["#97233F", "#000000"],
        "atl": ["#A71930", "#000000"],
        "bal": ["#241773", "#000000"],
        "buf": ["#00338D", "#C60C30"],
        "car": ["#0085CA", "#101820"],
        "chi": ["#0B162A", "#C83803"],
        "cin": ["#FB4F14", "#000000"],
        "cle": ["#FF3C00", "#311D00"],
        "dal": ["#003594", "#041E42"],
        "den": ["#FB4F14", "#002244"],
        "det": ["#0076B6", "#B0B7BC"],
        "gb": ["#203731", "#FFB612"],
        "hou": ["#03202F", "#A71930"],
        "ind": ["#002C5F", "#A2AAAD"],
        "jax": ["#101820", "#D7A22A"],
        "kc": ["#E31837", "#FFB81C"],
        "lv": ["#000000", "#A5ACAF"],
        "lac": ["#0080C6", "#FFC20E"],
        "lar": ["#003594", "#FFA300"],
        "mia": ["#008E97", "#FC4C02"],
        "min": ["#4F2683", "#FFC62F"],
        "ne": ["#002244", "#C60C30"],
        "no": ["#D3BC8D", "#101820"],
        "nyg": ["#0B2265", "#A71930"],
        "nyj": ["#125740", "#000000"],
        "phi": ["#004C54", "#A5ACAF"],
        "pit": ["#FFB612", "#101820"],
        "sf": ["#AA0000", "#B3995D"],
        "sea": ["#002244", "#69BE28"],
        "tb": ["#D50A0A", "#FF7900"],
        "ten": ["#0C2340", "#4B92DB"],
        "wsh": ["#5A1414", "#FFB612"]
      };
      
      // Track processed game IDs to prevent duplicates
      const processedGameIds = new Set();
      
      // Create synthetic game data from odds directly
      const games = oddsData.map((game: any, index: number) => {
        // Skip if we already processed this game
        if (processedGameIds.has(game.id)) return null;
        processedGameIds.add(game.id);
        
        // Get the main bookmaker (first one)
        if (!game.bookmakers || game.bookmakers.length === 0) return null;
        
        const bookmaker = game.bookmakers[0];
        const spreadsMarket = bookmaker.markets.find((m: any) => m.key === 'spreads');
        
        if (!spreadsMarket || spreadsMarket.outcomes.length < 2) return null;
        
        const homeOutcome = spreadsMarket.outcomes.find((o: any) => o.name === game.home_team);
        const awayOutcome = spreadsMarket.outcomes.find((o: any) => o.name === game.away_team);
        
        if (!homeOutcome || !awayOutcome) return null;
        
        // Get the actual spread from the API
        // Spread is positive for underdog, negative for favorite
        const homeSpread = parseFloat(homeOutcome.point);
        
        // Create synthetic team IDs and objects
        const baseId = 10000 + index;
        
        // Get team abbreviations
        const homeTeamAbbr = teamNameToAbbreviation[game.home_team] || game.home_team.substring(0, 3).toLowerCase();
        const awayTeamAbbr = teamNameToAbbreviation[game.away_team] || game.away_team.substring(0, 3).toLowerCase();
        
        // Get team colors
        const homeTeamColors = teamColors[homeTeamAbbr] || ["#1E293B", "#CBD5E1"];
        const awayTeamColors = teamColors[awayTeamAbbr] || ["#1E293B", "#CBD5E1"];

        const homeTeam = {
          id: baseId,
          name: game.home_team,
          abbreviation: homeTeamAbbr.toUpperCase(),
          logoUrl: `https://a.espncdn.com/i/teamlogos/nfl/500/${homeTeamAbbr}.png`,
          primaryColor: homeTeamColors[0],
          secondaryColor: homeTeamColors[1]
        };
        
        const awayTeam = {
          id: baseId + 1,
          name: game.away_team,
          abbreviation: awayTeamAbbr.toUpperCase(),
          logoUrl: `https://a.espncdn.com/i/teamlogos/nfl/500/${awayTeamAbbr}.png`,
          primaryColor: awayTeamColors[0],
          secondaryColor: awayTeamColors[1]
        };
        
        return {
          id: baseId + 2,
          weekId: currentWeek.id,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          homeTeamScore: null,
          awayTeamScore: null,
          spread: homeSpread, // Use the actual spread from the API
          homeTeamRecord: "0-0", // Placeholder record
          awayTeamRecord: "0-0", // Placeholder record
          gameTime: game.commence_time,
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          homeTeam,
          awayTeam
        };
      }).filter(Boolean);
      
      // Only return unique games (no duplicates)
      const uniqueGames = Array.from(new Map(games.map(game => 
        [game.homeTeam.name + game.awayTeam.name, game]
      )).values());
      
      res.json(uniqueGames);
    } catch (error) {
      console.error("Error fetching NFL odds games:", error);
      res.status(500).json({ message: "Failed to fetch NFL odds games" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
