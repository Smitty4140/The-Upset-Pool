import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { z } from "zod";
import { userPickFormSchema } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { userPicks, nflGames, nflWeeks, users } from "@shared/schema";
import emailRoutes from "./routes/email";
import { sendWelcomeEmail } from "./email";

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
  
  // Update user profile
  app.patch('/api/auth/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { username, profileImageUrl } = req.body;
      
      if (!username) {
        return res.status(400).json({ message: "Username is required" });
      }
      
      // Check if username is already taken by another user
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ message: "Username already taken" });
      }
      
      // Get current user data
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Update only the provided fields
      const updatedUser = await storage.upsertUser({
        id: userId,
        username,
        profileImageUrl: profileImageUrl || currentUser.profileImageUrl,
        email: currentUser.email,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
      });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Get all NFL teams
  app.get('/api/nfl-teams', async (_req, res) => {
    try {
      const teams = await storage.getNFLTeams();
      res.json(teams);
    } catch (error) {
      console.error("Error fetching NFL teams:", error);
      res.status(500).json({ message: "Failed to fetch NFL teams" });
    }
  });

  // Get all NFL weeks
  app.get('/api/nfl-weeks', async (_req, res) => {
    try {
      const weeks = await storage.getNFLWeeks();
      res.json(weeks);
    } catch (error) {
      console.error("Error fetching NFL weeks:", error);
      res.status(500).json({ message: "Failed to fetch NFL weeks" });
    }
  });

  // Get current NFL week
  app.get('/api/nfl-weeks/current', async (_req, res) => {
    try {
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }
      res.json(currentWeek);
    } catch (error) {
      console.error("Error fetching current NFL week:", error);
      res.status(500).json({ message: "Failed to fetch current NFL week" });
    }
  });

  // Get NFL games for a specific week
  app.get('/api/nfl-games/:weekId', async (req, res) => {
    try {
      const weekId = parseInt(req.params.weekId);
      if (isNaN(weekId)) {
        return res.status(400).json({ message: "Invalid week ID" });
      }

      const games = await storage.getNFLGames(weekId);
      res.json(games);
    } catch (error) {
      console.error("Error fetching NFL games:", error);
      res.status(500).json({ message: "Failed to fetch NFL games" });
    }
  });

  // Get underdog NFL games for a specific week
  app.get('/api/nfl-games/underdog', async (req, res) => {
    try {
      // Get current week
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }

      const games = await storage.getUnderdogGames(currentWeek.id);
      res.json(games);
    } catch (error) {
      console.error("Error fetching underdog games:", error);
      res.status(500).json({ message: "Failed to fetch underdog games" });
    }
  });

  // Get all leagues
  app.get('/api/leagues', async (_req, res) => {
    try {
      const leagues = await storage.getLeagues();
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching leagues:", error);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  // Get a specific league
  app.get('/api/leagues/:id', async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      res.json(league);
    } catch (error) {
      console.error("Error fetching league:", error);
      res.status(500).json({ message: "Failed to fetch league" });
    }
  });

  // Get user's leagues
  app.get('/api/user/leagues', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagues = await storage.getUserLeagues(userId);
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching user leagues:", error);
      res.status(500).json({ message: "Failed to fetch user leagues" });
    }
  });

  // Join a league
  app.post('/api/leagues/:id/join', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }

      const userId = req.user.claims.sub;
      
      // Check if league exists
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      // Check if user is already a member
      const userLeagues = await storage.getUserLeagues(userId);
      const isAlreadyMember = userLeagues.some(ul => ul.leagueId === leagueId);
      if (isAlreadyMember) {
        return res.status(400).json({ message: "Already a member of this league" });
      }

      // Add user to league
      const leagueMember = await storage.addLeagueMember({
        leagueId,
        userId,
        isAdmin: false,
      });

      res.status(201).json(leagueMember);
    } catch (error) {
      console.error("Error joining league:", error);
      res.status(500).json({ message: "Failed to join league" });
    }
  });

  // Get league members
  app.get('/api/leagues/:id/members', async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }

      const members = await storage.getLeagueMembers(leagueId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching league members:", error);
      res.status(500).json({ message: "Failed to fetch league members" });
    }
  });

  // Get a user's pick for the current week
  app.get('/api/user/pick', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get current week
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }
      
      // Default to NFL Upset Pool league (ID 1)
      const leagueId = parseInt(req.query.leagueId as string) || 1;
      
      const pick = await storage.getUserPick(userId, currentWeek.id, leagueId);
      res.json(pick || null);
    } catch (error) {
      console.error("Error fetching user pick:", error);
      res.status(500).json({ message: "Failed to fetch user pick" });
    }
  });

  // Get all picks for the current week in a league
  app.get('/api/leagues/:id/picks', async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }
      
      // Get current week
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }
      
      const picks = await storage.getUserPicksForWeek(currentWeek.id, leagueId);
      res.json(picks);
    } catch (error) {
      console.error("Error fetching league picks:", error);
      res.status(500).json({ message: "Failed to fetch league picks" });
    }
  });

  // Get all users
  app.get('/api/users', isAuthenticated, async (req: any, res) => {
    try {
      // Only allow admins to access this route (your account)
      const userId = req.user.claims.sub;
      if (userId !== "42820911") {
        return res.status(403).json({ message: "Unauthorized: Admin access required" });
      }
      
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  
  // Add user to league (admin only)
  app.post('/api/leagues/:id/members', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }
      
      // Only allow admins to access this route (your account)
      const adminId = req.user.claims.sub;
      if (adminId !== "42820911") {
        return res.status(403).json({ message: "Unauthorized: Admin access required" });
      }
      
      const { userId, isAdmin } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      // Verify user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if user is already a member
      const userLeagues = await storage.getUserLeagues(userId);
      const existingMembership = userLeagues.find(ul => ul.leagueId === leagueId);
      
      if (existingMembership) {
        return res.status(400).json({ message: "User is already a member of this league" });
      }
      
      // Add user to league
      const leagueMember = await storage.addLeagueMember({
        leagueId,
        userId,
        isAdmin: !!isAdmin,
      });
      
      res.status(201).json(leagueMember);
    } catch (error) {
      console.error("Error adding member to league:", error);
      res.status(500).json({ message: "Failed to add member to league" });
    }
  });
  
  // Update league member (toggle admin status)
  app.patch('/api/leagues/:leagueId/members/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = parseInt(req.params.leagueId);
      const memberId = req.params.userId;
      const { isAdmin } = req.body;
      
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }
      
      // Only allow admins to access this route (your account)
      const adminId = req.user.claims.sub;
      if (adminId !== "42820911") {
        return res.status(403).json({ message: "Unauthorized: Admin access required" });
      }
      
      // Check if membership exists
      const userLeagues = await storage.getUserLeagues(memberId);
      const existingMembership = userLeagues.find(ul => ul.leagueId === leagueId);
      
      if (!existingMembership) {
        return res.status(404).json({ message: "League membership not found" });
      }
      
      // Update member status
      await storage.updateLeagueMember(leagueId, memberId, { isAdmin: !!isAdmin });
      
      res.json({ message: "Member updated successfully" });
    } catch (error) {
      console.error("Error updating league member:", error);
      res.status(500).json({ message: "Failed to update league member" });
    }
  });
  
  // Remove user from league
  app.delete('/api/leagues/:leagueId/members/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = parseInt(req.params.leagueId);
      const memberId = req.params.userId;
      
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }
      
      // Only allow admins to access this route (your account)
      const adminId = req.user.claims.sub;
      if (adminId !== "42820911") {
        return res.status(403).json({ message: "Unauthorized: Admin access required" });
      }
      
      // Remove user from league
      await storage.removeLeagueMember(leagueId, memberId);
      
      res.json({ message: "Member removed successfully" });
    } catch (error) {
      console.error("Error removing league member:", error);
      res.status(500).json({ message: "Failed to remove league member" });
    }
  });
  
  // Auto-add new users to the default league (NFL Upset Pool)
  // This is triggered when a new user is created during auth setup
  app.post('/api/auto-add-to-league', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      // Default to NFL Upset Pool league (ID 1)
      const leagueId = 1;
      
      // Check if user is already a member
      const userLeagues = await storage.getUserLeagues(userId);
      const isAlreadyMember = userLeagues.some(ul => ul.leagueId === leagueId);
      
      if (isAlreadyMember) {
        return res.status(200).json({ message: "User is already a member of this league" });
      }
      
      // Add user to league
      const leagueMember = await storage.addLeagueMember({
        leagueId,
        userId,
        isAdmin: false,
      });
      
      res.status(201).json(leagueMember);
    } catch (error) {
      console.error("Error auto-adding user to league:", error);
      res.status(500).json({ message: "Failed to add user to league" });
    }
  });
  
  // Submit a pick for the current week
  app.post('/api/user/pick', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate the request body
      const validationResult = userPickFormSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ message: "Invalid pick data", errors: validationResult.error.errors });
      }
      
      const pickData = validationResult.data;
      
      // Get current week
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }
      
      // Make sure the week matches the current week
      if (pickData.weekId !== currentWeek.id) {
        return res.status(400).json({ message: "Pick must be for the current week" });
      }
      
      // Check if the pick lock time has passed
      const now = new Date();
      const lockTime = new Date(currentWeek.picksLockAt);
      if (now > lockTime) {
        return res.status(400).json({ message: "Picks are locked for this week" });
      }
      
      // Get the game
      const game = await storage.getNFLGame(pickData.gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      
      // Determine if the picked team is an underdog
      const isUnderdog = (game.homeTeamId === pickData.pickedTeamId && game.spread > 0) || 
                         (game.awayTeamId === pickData.pickedTeamId && game.spread < 0);
      
      // Check if user already has a pick for this week and league
      const existingPick = await storage.getUserPick(userId, currentWeek.id, pickData.leagueId);
      
      if (existingPick) {
        // Update existing pick
        const updatedPick = await storage.updateUserPick(existingPick.id, {
          gameId: pickData.gameId,
          pickedTeamId: pickData.pickedTeamId,
          isUnderdog,
          spreadAtTimeOfPick: Math.abs(game.spread),
        });
        
        return res.json(updatedPick);
      } else {
        // Create new pick
        const newPick = await storage.createUserPick({
          userId,
          leagueId: pickData.leagueId,
          weekId: currentWeek.id,
          gameId: pickData.gameId,
          pickedTeamId: pickData.pickedTeamId,
          isUnderdog,
          spreadAtTimeOfPick: Math.abs(game.spread),
          won: null,
          pointsEarned: null,
        });
        
        return res.status(201).json(newPick);
      }
    } catch (error) {
      console.error("Error submitting pick:", error);
      res.status(500).json({ message: "Failed to submit pick" });
    }
  });

  // Get leaderboard for a league
  app.get('/api/league/:id/leaderboard', async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }
      
      const leaderboard = await storage.getLeaderboard(leagueId);
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });
  
  // NFL Odds API route
  app.get('/api/nfl-odds', async (req, res) => {
    try {
      const apiKey = process.env.THE_ODDS_API_KEY;
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
  
  // Seed NFL weeks data if needed
  app.get('/api/seed-nfl-weeks', async (_req, res) => {
    try {
      const { seedNFLWeeks } = await import('./seedData');
      const weeks = await seedNFLWeeks();
      res.json({ message: `Successfully seeded ${weeks.length} NFL weeks` });
    } catch (error) {
      console.error("Error seeding NFL weeks:", error);
      res.status(500).json({ message: "Failed to seed NFL weeks" });
    }
  });
  
  // Helper function to determine which NFL week a game belongs to based on its date
  function determineNFLWeek(gameDate: string, weeks: any[]): number | null {
    // Parse game date
    const gameTime = new Date(gameDate);
    
    // 2025 NFL Season pattern:
    // Week 1: Early September 2025 (approx Sept 4-9)
    // Week 2: Mid September 2025 (approx Sept 11-15)
    // etc.
    
    // Map common NFL month patterns to weeks (approximate)
    const month = gameTime.getMonth(); // 0 = January, 8 = September
    const day = gameTime.getDate();
    
    if (month === 8) { // September
      if (day <= 9) return 1; // Week 1: Sept 1-9
      if (day <= 16) return 2; // Week 2: Sept 10-16
      if (day <= 23) return 3; // Week 3: Sept 17-23
      return 4; // Week 4: Sept 24-30
    } 
    else if (month === 9) { // October
      if (day <= 7) return 5; // Week 5: Oct 1-7
      if (day <= 14) return 6; // Week 6: Oct 8-14
      if (day <= 21) return 7; // Week 7: Oct 15-21
      return 8; // Week 8: Oct 22-31
    }
    else if (month === 10) { // November
      if (day <= 7) return 9; // Week 9: Nov 1-7
      if (day <= 14) return 10; // Week 10: Nov 8-14
      if (day <= 21) return 11; // Week 11: Nov 15-21
      return 12; // Week 12: Nov 22-30
    }
    else if (month === 11) { // December
      if (day <= 7) return 13; // Week 13: Dec 1-7
      if (day <= 14) return 14; // Week 14: Dec 8-14
      if (day <= 21) return 15; // Week 15: Dec 15-21
      return 16; // Week 16: Dec 22-31
    }
    else if (month === 0) { // January
      return 17; // Week 17-18: Jan 1 onwards (end of regular season)
    }
    
    // If no specific week mapping found, use the date range method as fallback
    for (const week of weeks) {
      const startDate = new Date(week.startDate);
      const endDate = new Date(week.endDate);
      
      // Check if game date falls within this week's range
      if (gameTime >= startDate && gameTime <= endDate) {
        return week.id;
      }
    }
    
    // If no match, return the first week's ID as fallback
    return weeks.length > 0 ? weeks[0].id : null;
  }
  
  // NFL Odds Games route - get games from The Odds API in the app's format
  app.get('/api/odds-games', async (req, res) => {
    try {
      // Get all NFL weeks
      const allWeeks = await storage.getNFLWeeks();
      if (!allWeeks || allWeeks.length === 0) {
        return res.status(404).json({ message: "No NFL weeks found. Please run /api/seed-nfl-weeks first." });
      }
      
      // Get the current week from our database
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }

      // Define the fallback games
      const fallbackGames = [
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
          gameTime: "2025-09-10T00:20:00Z",
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
            name: "Buffalo Bills",
            abbreviation: "BUF",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png",
            primaryColor: "#00338D",
            secondaryColor: "#C60C30"
          }
        },
        {
          id: 1002,
          weekId: currentWeek.id,
          homeTeamId: 3,
          awayTeamId: 4,
          homeTeamScore: null,
          awayTeamScore: null,
          spread: -2.5,
          homeTeamRecord: "0-0",
          awayTeamRecord: "0-0",
          gameTime: "2025-09-11T00:15:00Z",
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          homeTeam: {
            id: 3,
            name: "San Francisco 49ers",
            abbreviation: "SF",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png",
            primaryColor: "#AA0000",
            secondaryColor: "#B3995D"
          },
          awayTeam: {
            id: 4,
            name: "Detroit Lions",
            abbreviation: "DET",
            logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/det.png",
            primaryColor: "#0076B6",
            secondaryColor: "#B0B7BC"
          }
        }
      ];
      
      // Determine whether to use real data or fallback data
      let resultGames = fallbackGames;
      
      try {
        // Try to get real NFL data from The Odds API
        const apiKey = process.env.THE_ODDS_API_KEY;
        const response = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?regions=us&markets=spreads&apiKey=${apiKey}&bookmakers=draftkings`);
        
        if (response.ok) {
          const oddsData = await response.json();
          console.log(`Successfully fetched ${oddsData.length} NFL games from The Odds API`);
          
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

          // Team colors for better visual appeal
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
          
          // Convert Odds API data to our app's format
          const realGames = oddsData.map((game: any, index: number) => {
            // Skip if we already processed this game
            if (processedGameIds.has(game.id)) return null;
            processedGameIds.add(game.id);
            
            // Get the DraftKings bookmaker data
            if (!game.bookmakers || game.bookmakers.length === 0) return null;
            
            const bookmaker = game.bookmakers[0]; // DraftKings bookmaker
            const spreadsMarket = bookmaker.markets.find((m: any) => m.key === 'spreads');
            
            if (!spreadsMarket || spreadsMarket.outcomes.length < 2) return null;
            
            const homeOutcome = spreadsMarket.outcomes.find((o: any) => o.name === game.home_team);
            const awayOutcome = spreadsMarket.outcomes.find((o: any) => o.name === game.away_team);
            
            if (!homeOutcome || !awayOutcome) return null;
            
            // Get the actual spread from the API
            // DraftKings provides negative values for favorites and positive for underdogs
            const homeSpread = parseFloat(homeOutcome.point);
            
            // Create synthetic team IDs and objects
            const baseId = 10000 + index;
            
            // Get team abbreviations
            const homeTeamAbbr = teamNameToAbbreviation[game.home_team] || game.home_team.substring(0, 3).toLowerCase();
            const awayTeamAbbr = teamNameToAbbreviation[game.away_team] || game.away_team.substring(0, 3).toLowerCase();
            
            // Get team colors
            const homeTeamColors = teamColors[homeTeamAbbr] || ["#1E293B", "#CBD5E1"];
            const awayTeamColors = teamColors[awayTeamAbbr] || ["#1E293B", "#CBD5E1"];
            
            // Create team objects
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
            
            // Determine the correct NFL week based on the game date
            const gameWeekId = determineNFLWeek(game.commence_time, allWeeks) || currentWeek.id;
            
            // Create game object
            return {
              id: baseId + 2,
              weekId: gameWeekId, // Use the correctly determined week ID
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
          
          // Use real games if we got any
          if (realGames.length > 0) {
            resultGames = realGames;
            console.log(`Using ${realGames.length} real NFL games from The Odds API`);
          } else {
            console.log('No real NFL games found, using fallback data');
          }
        } else {
          console.log(`Odds API returned status: ${response.status}, using fallback data`);
        }
      } catch (apiError) {
        console.error("Error fetching from The Odds API:", apiError);
        console.log("Using fallback game data instead");
      }
      
      // Return the games data
      res.json(resultGames);
      
    } catch (error) {
      console.error("Error in /api/odds-games route:", error);
      res.status(500).json({ message: "Failed to fetch NFL odds games" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}