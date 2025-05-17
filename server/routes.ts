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

  const httpServer = createServer(app);
  return httpServer;
}
