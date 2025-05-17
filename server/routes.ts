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
      // Get the current week from our database
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }

      // Hard-coded Week 1 NFL games data for development
      // In a production app, we would use the The Odds API with the current API key
      const nflGames = [
        {
          id: 1001,
          weekId: currentWeek.id,
          homeTeamId: 1,
          awayTeamId: 2,
          homeTeamScore: null,
          awayTeamScore: null,
          spread: 3.5,
          homeTeamRecord: "0-0",
          awayTeamRecord: "0-0",
          gameTime: "2025-09-07T17:00:00Z",
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          homeTeam: {
            id: 1,
            name: "Kansas City Chiefs",
            abbreviation: "KC",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png",
            primaryColor: "#E31837",
            secondaryColor: "#FFB81C"
          },
          awayTeam: {
            id: 2,
            name: "Detroit Lions",
            abbreviation: "DET",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/det.png",
            primaryColor: "#0076B6",
            secondaryColor: "#B0B7BC"
          }
        },
        {
          id: 1002,
          weekId: currentWeek.id,
          homeTeamId: 3,
          awayTeamId: 4,
          homeTeamScore: null,
          awayTeamScore: null,
          spread: 2.5,
          homeTeamRecord: "0-0",
          awayTeamRecord: "0-0",
          gameTime: "2025-09-07T20:25:00Z",
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          homeTeam: {
            id: 3,
            name: "Buffalo Bills",
            abbreviation: "BUF",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png",
            primaryColor: "#00338D",
            secondaryColor: "#C60C30"
          },
          awayTeam: {
            id: 4,
            name: "New York Jets",
            abbreviation: "NYJ",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png",
            primaryColor: "#125740",
            secondaryColor: "#000000"
          }
        },
        {
          id: 1003,
          weekId: currentWeek.id,
          homeTeamId: 5,
          awayTeamId: 6,
          homeTeamScore: null,
          awayTeamScore: null,
          spread: 6.5,
          homeTeamRecord: "0-0",
          awayTeamRecord: "0-0",
          gameTime: "2025-09-07T20:25:00Z",
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          homeTeam: {
            id: 5,
            name: "San Francisco 49ers",
            abbreviation: "SF",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png",
            primaryColor: "#AA0000",
            secondaryColor: "#B3995D"
          },
          awayTeam: {
            id: 6,
            name: "Green Bay Packers",
            abbreviation: "GB",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png",
            primaryColor: "#203731",
            secondaryColor: "#FFB612"
          }
        },
        {
          id: 1004,
          weekId: currentWeek.id,
          homeTeamId: 7,
          awayTeamId: 8,
          homeTeamScore: null,
          awayTeamScore: null,
          spread: 4,
          homeTeamRecord: "0-0",
          awayTeamRecord: "0-0",
          gameTime: "2025-09-08T00:20:00Z",
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          homeTeam: {
            id: 7,
            name: "Los Angeles Rams",
            abbreviation: "LAR",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lar.png",
            primaryColor: "#003594",
            secondaryColor: "#FFA300"
          },
          awayTeam: {
            id: 8,
            name: "Dallas Cowboys",
            abbreviation: "DAL",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png",
            primaryColor: "#003594",
            secondaryColor: "#041E42" 
          }
        },
        {
          id: 1005,
          weekId: currentWeek.id,
          homeTeamId: 9,
          awayTeamId: 10,
          homeTeamScore: null,
          awayTeamScore: null,
          spread: 3,
          homeTeamRecord: "0-0",
          awayTeamRecord: "0-0",
          gameTime: "2025-09-08T00:20:00Z",
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          homeTeam: {
            id: 9,
            name: "New York Giants",
            abbreviation: "NYG",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png",
            primaryColor: "#0B2265",
            secondaryColor: "#A71930"
          },
          awayTeam: {
            id: 10,
            name: "Minnesota Vikings",
            abbreviation: "MIN",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/min.png",
            primaryColor: "#4F2683",
            secondaryColor: "#FFC62F"
          }
        }
      ];
      
      // Return the fixtures
      res.json(nflGames);
    } catch (error) {
      console.error("Error fetching NFL odds games:", error);
      res.status(500).json({ message: "Failed to fetch NFL odds games" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
