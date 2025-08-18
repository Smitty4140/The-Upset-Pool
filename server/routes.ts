import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { z } from "zod";
import { userPickFormSchema } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { db, pool } from "./db";
import { userPicks, nflGames, nflWeeks, users, nflTeams } from "@shared/schema";
import emailRoutes from "./routes/email";
import { sendWelcomeEmail } from "./email";

// Super user configuration - only this account has access to system admin functions
const SUPER_USER_ID = "user_1753731196994_qfjmyp5i2";

// Middleware to check if user is super user
function isSuperUser(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  
  if (req.user.id !== SUPER_USER_ID) {
    return res.status(403).json({ message: "Super user access required" });
  }
  
  next();
}

// Helper function to ensure all NFL teams exist in the database
async function ensureNFLTeamsExist() {
  // Get all teams from the database
  const existingTeams = await db.select().from(nflTeams);
  const existingTeamMap = new Map();
  
  // Create a map for quick lookup
  existingTeams.forEach(team => {
    existingTeamMap.set(team.name, team);
  });
  
  // NFL Team data we want to ensure exists
  const nflTeamData = [
    { id: 1, name: "Kansas City Chiefs", abbreviation: "KC", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png", primaryColor: "#E31837", secondaryColor: "#FFB81C" },
    { id: 2, name: "San Francisco 49ers", abbreviation: "SF", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png", primaryColor: "#AA0000", secondaryColor: "#B3995D" },
    { id: 3, name: "Dallas Cowboys", abbreviation: "DAL", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png", primaryColor: "#003594", secondaryColor: "#869397" },
    { id: 4, name: "Green Bay Packers", abbreviation: "GB", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png", primaryColor: "#203731", secondaryColor: "#FFB612" },
    { id: 5, name: "Buffalo Bills", abbreviation: "BUF", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png", primaryColor: "#00338D", secondaryColor: "#C60C30" },
    { id: 6, name: "Baltimore Ravens", abbreviation: "BAL", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png", primaryColor: "#241773", secondaryColor: "#000000" },
    { id: 7, name: "Cincinnati Bengals", abbreviation: "CIN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/cin.png", primaryColor: "#FB4F14", secondaryColor: "#000000" },
    { id: 8, name: "Philadelphia Eagles", abbreviation: "PHI", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png", primaryColor: "#004C54", secondaryColor: "#A5ACAF" },
    { id: 9, name: "Miami Dolphins", abbreviation: "MIA", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/mia.png", primaryColor: "#008E97", secondaryColor: "#FC4C02" },
    { id: 10, name: "Los Angeles Rams", abbreviation: "LAR", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lar.png", primaryColor: "#003594", secondaryColor: "#FFA300" },
    { id: 11, name: "Detroit Lions", abbreviation: "DET", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/det.png", primaryColor: "#0076B6", secondaryColor: "#B0B7BC" },
    { id: 12, name: "Chicago Bears", abbreviation: "CHI", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/chi.png", primaryColor: "#0B162A", secondaryColor: "#C83803" },
    { id: 13, name: "New Orleans Saints", abbreviation: "NO", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/no.png", primaryColor: "#D3BC8D", secondaryColor: "#101820" },
    { id: 14, name: "Atlanta Falcons", abbreviation: "ATL", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/atl.png", primaryColor: "#A71930", secondaryColor: "#000000" },
    { id: 15, name: "New England Patriots", abbreviation: "NE", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ne.png", primaryColor: "#002244", secondaryColor: "#C60C30" },
    { id: 16, name: "New York Jets", abbreviation: "NYJ", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png", primaryColor: "#125740", secondaryColor: "#000000" },
    { id: 17, name: "Arizona Cardinals", abbreviation: "ARI", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ari.png", primaryColor: "#97233F", secondaryColor: "#000000" },
    { id: 18, name: "Los Angeles Chargers", abbreviation: "LAC", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lac.png", primaryColor: "#0080C6", secondaryColor: "#FFC20E" },
    { id: 19, name: "New York Giants", abbreviation: "NYG", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png", primaryColor: "#0B2265", secondaryColor: "#A71930" },
    { id: 20, name: "Washington Commanders", abbreviation: "WAS", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png", primaryColor: "#5A1414", secondaryColor: "#FFB612" },
    { id: 21, name: "Tennessee Titans", abbreviation: "TEN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ten.png", primaryColor: "#0C2340", secondaryColor: "#4B92DB" },
    { id: 22, name: "Jacksonville Jaguars", abbreviation: "JAX", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/jax.png", primaryColor: "#006778", secondaryColor: "#9F792C" },
    { id: 23, name: "Carolina Panthers", abbreviation: "CAR", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/car.png", primaryColor: "#0085CA", secondaryColor: "#101820" },
    { id: 24, name: "Seattle Seahawks", abbreviation: "SEA", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png", primaryColor: "#002244", secondaryColor: "#69BE28" },
    { id: 25, name: "Cleveland Browns", abbreviation: "CLE", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/cle.png", primaryColor: "#311D00", secondaryColor: "#FF3C00" },
    { id: 26, name: "Pittsburgh Steelers", abbreviation: "PIT", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/pit.png", primaryColor: "#FFB612", secondaryColor: "#101820" },
    { id: 27, name: "Minnesota Vikings", abbreviation: "MIN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/min.png", primaryColor: "#4F2683", secondaryColor: "#FFC62F" },
    { id: 28, name: "Las Vegas Raiders", abbreviation: "LV", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lv.png", primaryColor: "#000000", secondaryColor: "#A5ACAF" },
    { id: 29, name: "Houston Texans", abbreviation: "HOU", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png", primaryColor: "#03202F", secondaryColor: "#A71930" },
    { id: 30, name: "Indianapolis Colts", abbreviation: "IND", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ind.png", primaryColor: "#002C5F", secondaryColor: "#A2AAAD" },
    { id: 31, name: "Denver Broncos", abbreviation: "DEN", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/den.png", primaryColor: "#FB4F14", secondaryColor: "#002244" },
    { id: 32, name: "Tampa Bay Buccaneers", abbreviation: "TB", logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/tb.png", primaryColor: "#D50A0A", secondaryColor: "#FF7900" }
  ];
  
  // Insert any missing teams
  for (const teamData of nflTeamData) {
    if (!existingTeamMap.has(teamData.name)) {
      try {
        await db.insert(nflTeams).values(teamData);
        console.log(`Added team: ${teamData.name}`);
      } catch (error) {
        console.error(`Error adding team ${teamData.name}:`, error);
      }
    }
  }
  
  return await db.select().from(nflTeams);
}

// Helper function to find a team ID by team name
async function findTeamIdByName(teamName: string): Promise<number> {
  try {
    // First, make sure all NFL teams are in the database
    await ensureNFLTeamsExist();
    
    // Search for the team by name
    const [team] = await db.select().from(nflTeams).where(eq(nflTeams.name, teamName));
    
    if (team) {
      return team.id;
    }
    
    // If not found directly, try a more flexible search
    const allTeams = await db.select().from(nflTeams);
    
    // Try to find a close match (e.g., "Kansas City" would match "Kansas City Chiefs")
    for (const team of allTeams) {
      if (team.name.includes(teamName) || teamName.includes(team.name)) {
        return team.id;
      }
    }
    
    // If still not found, create a new team with this name
    console.log(`Team not found: ${teamName}, creating new entry`);
    const [newTeam] = await db.insert(nflTeams).values({
      name: teamName,
      abbreviation: teamName.substring(0, 3).toUpperCase(),
      logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/default-team-logo-500.png",
      primaryColor: "#000000",
      secondaryColor: "#FFFFFF"
    }).returning();
    
    return newTeam.id;
  } catch (error) {
    console.error(`Error finding team ID for ${teamName}:`, error);
    return 0; // Default value if we can't find or create a team
  }
}

// Helper function to get NFL games data from the Odds API
async function getOddsGamesData() {
  // Try to get real NFL data from The Odds API
  try {
    const apiKey = process.env.THE_ODDS_API_KEY;
    const response = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?regions=us&markets=spreads&apiKey=${apiKey}&bookmakers=draftkings`);
    
    if (response.ok) {
      const oddsData = await response.json();
      console.log(`Successfully fetched ${oddsData.length} NFL games from The Odds API`);
      
      // Ensure all NFL teams exist in the database
      await ensureNFLTeamsExist();
      
      // Format the data to match our expected game structure
      return oddsData.map((game: any, index: number) => {
        // Instead of making an arbitrary ID, use the original game's API ID
        // This ensures the game ID from frontend to backend is consistent
        const gameId = game.id; 
        const homeTeam = game.home_team;
        const awayTeam = game.away_team;
        const bookmaker = game.bookmakers?.find(b => b.key === 'draftkings') || game.bookmakers?.[0];
        let spread = 0;
        
        console.log(`Processing game: ${homeTeam} vs ${awayTeam}, ID: ${gameId}`);
        
        // Extract the spread from DraftKings data (or fallback to first bookmaker)
        if (bookmaker && bookmaker.markets?.[0]?.outcomes) {
          const homeOutcome = bookmaker.markets[0].outcomes.find((o: any) => o.name === homeTeam);
          if (homeOutcome) {
            spread = homeOutcome.point;
            console.log(`Found spread for ${homeTeam}: ${spread}`);
          }
        }
        
        // We need to synchronously return the data - a Promise can't be returned here
        // So we'll use simple team ID assignments based on our existing NFL teams data
        const homeTeamId = index * 2 + 1;
        const awayTeamId = index * 2 + 2;
        
        return {
          id: game.id, // Use the original API ID directly
          weekId: 1, // Assuming current week
          
          // Use simple numeric IDs for now
          homeTeamId: homeTeamId,
          awayTeamId: awayTeamId,
          
          // Team info for display
          homeTeam: { 
            id: homeTeamId, 
            name: homeTeam 
          },
          awayTeam: { 
            id: awayTeamId, 
            name: awayTeam 
          },
          
          spread: spread,
          gameTime: game.commence_time,
          
          // Determine underdog based on spread
          underdogTeamId: spread > 0 ? homeTeamId : awayTeamId,
          underdogName: spread > 0 ? homeTeam : awayTeam,
          underdogValue: Math.abs(spread)
        };
      });
    }
  } catch (error) {
    console.error("Error fetching from The Odds API:", error);
  }
  
  // Return empty array if API call fails
  return [];
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes are now handled in setupAuth
  
  // Update user profile
  app.patch('/api/auth/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
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

  // Get user's league member status (activation status)
  app.get('/api/league/:leagueId/member-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const leagueId = parseInt(req.params.leagueId);
      
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }
      
      const leagueMember = await storage.getLeagueMember(leagueId, userId);
      if (!leagueMember) {
        return res.status(404).json({ message: "Not a member of this league" });
      }
      
      res.json({ 
        isActive: leagueMember.isActive,
        isAdmin: leagueMember.isAdmin 
      });
    } catch (error) {
      console.error("Error fetching member status:", error);
      res.status(500).json({ message: "Failed to fetch member status" });
    }
  });

  // Admin-only route to toggle member activation status
  app.post('/api/admin/league/:leagueId/member/:userId/toggle-active', isAuthenticated, async (req: any, res) => {
    try {
      const adminUserId = req.user.id;
      const leagueId = parseInt(req.params.leagueId);
      const targetUserId = req.params.userId;
      
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }
      
      // Check if the requesting user is an admin of this league
      const adminMember = await storage.getLeagueMember(leagueId, adminUserId);
      if (!adminMember || !adminMember.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Get the target member
      const targetMember = await storage.getLeagueMember(leagueId, targetUserId);
      if (!targetMember) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      // Toggle activation status
      const updatedMember = await storage.updateLeagueMember(leagueId, targetUserId, {
        isActive: !targetMember.isActive
      });
      
      res.json({ 
        message: `Member ${updatedMember.isActive ? 'activated' : 'deactivated'} successfully`,
        isActive: updatedMember.isActive 
      });
    } catch (error) {
      console.error("Error toggling member activation:", error);
      res.status(500).json({ message: "Failed to toggle member activation" });
    }
  });

  // Admin-only route to toggle member admin status
  app.post('/api/admin/league/:leagueId/member/:userId/toggle-admin', isAuthenticated, async (req: any, res) => {
    try {
      const adminUserId = req.user.id;
      const leagueId = parseInt(req.params.leagueId);
      const targetUserId = req.params.userId;
      
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }
      
      // Check if the requesting user is an admin of this league
      const adminMember = await storage.getLeagueMember(leagueId, adminUserId);
      if (!adminMember || !adminMember.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Get the target member
      const targetMember = await storage.getLeagueMember(leagueId, targetUserId);
      if (!targetMember) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      // Prevent admin from removing their own admin status (to avoid locking themselves out)
      if (adminUserId === targetUserId && targetMember.isAdmin) {
        return res.status(400).json({ message: "Cannot remove your own admin privileges" });
      }
      
      // Toggle admin status
      const updatedMember = await storage.updateLeagueMember(leagueId, targetUserId, {
        isAdmin: !targetMember.isAdmin
      });
      
      res.json({ 
        message: `Admin privileges ${updatedMember.isAdmin ? 'granted to' : 'removed from'} member successfully`,
        isAdmin: updatedMember.isAdmin 
      });
    } catch (error) {
      console.error("Error toggling member admin status:", error);
      res.status(500).json({ message: "Failed to toggle member admin status" });
    }
  });

  // Admin-only route to remove a member from a league
  app.delete('/api/admin/league/:leagueId/member/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const adminUserId = req.user.id;
      const leagueId = parseInt(req.params.leagueId);
      const targetUserId = req.params.userId;
      
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }
      
      // Check if the requesting user is an admin of this league
      const adminMember = await storage.getLeagueMember(leagueId, adminUserId);
      if (!adminMember || !adminMember.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Get the target member to verify they exist
      const targetMember = await storage.getLeagueMember(leagueId, targetUserId);
      if (!targetMember) {
        return res.status(404).json({ message: "Member not found in this league" });
      }
      
      // Prevent admin from removing themselves
      if (adminUserId === targetUserId) {
        return res.status(400).json({ message: "You cannot remove yourself from the league" });
      }
      
      // Remove the member from the league
      await storage.removeLeagueMember(leagueId, targetUserId);
      
      res.json({ 
        message: "User removed from league successfully"
      });
    } catch (error) {
      console.error("Error removing league member:", error);
      res.status(500).json({ message: "Failed to remove user from league" });
    }
  });
  
  // Toggle lock status for picks in a week (admin only)
  app.post('/api/admin/week/:id/toggle-lock', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const weekId = parseInt(req.params.id);
      const leagueId = parseInt(req.body.leagueId);
      const locked = req.body.locked;
      
      // Validate input
      if (isNaN(weekId) || isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid week ID or league ID" });
      }
      
      // Verify user is an admin for this league
      const leagueMembers = await storage.getLeagueMembers(leagueId);
      const userMembership = leagueMembers.find(member => member.userId === userId);
      
      if (!userMembership || !userMembership.isAdmin) {
        return res.status(403).json({ message: "You do not have admin permission for this league" });
      }
      
      // Get the current week
      const week = await storage.getNFLWeek(weekId);
      if (!week) {
        return res.status(404).json({ message: "Week not found" });
      }
      
      // Calculate the correct Sunday for this NFL week
      const weekStart = new Date(week.startDate);
      const weekEnd = new Date(week.endDate);
      
      // Find the first Sunday within the week range (usually the only Sunday)
      let sundayDate = new Date(weekStart);
      while (sundayDate.getDay() !== 0 && sundayDate <= weekEnd) { // 0 = Sunday
        sundayDate.setDate(sundayDate.getDate() + 1);
      }
      
      // If no Sunday found in range, use the start date (shouldn't happen with proper NFL weeks)
      if (sundayDate > weekEnd) {
        sundayDate = new Date(weekStart);
      }
      
      // Set lock time to 1:00 PM Eastern Time on the Sunday of this NFL week
      let picksLockAt: Date;
      if (locked) {
        picksLockAt = new Date(Date.now() - 60000); // 1 minute in the past for locking immediately
      } else {
        // Create 1:00 PM Eastern Time on the Sunday, properly accounting for DST
        // We'll use a more reliable method that handles EST/EDT transitions automatically
        
        // Create the target date string for 1 PM Eastern
        const year = sundayDate.getFullYear();
        const month = String(sundayDate.getMonth() + 1).padStart(2, '0');
        const day = String(sundayDate.getDate()).padStart(2, '0');
        
        // Try both possible UTC offsets and see which one gives us 1 PM Eastern
        const edtTime = new Date(`${year}-${month}-${day}T17:00:00.000Z`); // 1 PM EDT = 5 PM UTC
        const estTime = new Date(`${year}-${month}-${day}T18:00:00.000Z`); // 1 PM EST = 6 PM UTC
        
        // Test which one actually displays as 1 PM in America/New_York timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour: 'numeric',
          hour12: false
        });
        
        const edtHour = parseInt(formatter.format(edtTime));
        const estHour = parseInt(formatter.format(estTime));
        
        // Use whichever gives us 13 (1 PM in 24-hour format)
        if (edtHour === 13) {
          picksLockAt = edtTime;
        } else if (estHour === 13) {
          picksLockAt = estTime;
        } else {
          // Fallback - this shouldn't happen, but just in case
          picksLockAt = edtTime;
        }
      }
      
      // Use direct SQL query to update the picksLockAt field
      await db.execute(sql`
        UPDATE nfl_weeks 
        SET picks_lock_at = ${picksLockAt.toISOString()}
        WHERE id = ${weekId}
      `);
      
      // Fetch the updated week
      const updatedWeek = await storage.getNFLWeek(weekId);
      
      if (!updatedWeek) {
        return res.status(500).json({ message: "Failed to update week lock status" });
      }
      
      return res.json({
        message: `Week ${week.weekNumber} picks are now ${locked ? 'locked' : 'unlocked'}`,
        week: updatedWeek
      });
    } catch (error) {
      console.error("Error toggling week lock status:", error);
      return res.status(500).json({ message: "Failed to update week lock status" });
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

  // This route has been moved after the more specific /api/nfl-games/week/:weekId route below

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
  
  // Get NFL games for a specific week with formatted response for frontend
  // Get NFL games for a specific week - important: must be before the generic /:weekId route
  app.get('/api/nfl-games/week/:weekId', async (req, res) => {
    try {
      const weekId = parseInt(req.params.weekId);
      
      if (isNaN(weekId)) {
        return res.status(400).json({ message: "Invalid week ID" });
      }
      
      // Get games from database via storage
      const games = await storage.getNFLGames(weekId);
      
      console.log(`Found ${games.length} games for week ${weekId}`);
      
      // Format the games to ensure compatibility with the frontend
      const formattedGames = games.map(game => {
        // Determine which team is the underdog based on the spread
        const isHomeUnderdog = Number(game.spread) > 0;
        const isAwayUnderdog = Number(game.spread) < 0;
        
        return {
          ...game,
          id: game.id.toString(), // Convert ID to string for frontend compatibility
          underdogTeamId: isHomeUnderdog ? game.homeTeamId : isAwayUnderdog ? game.awayTeamId : null,
          underdogName: isHomeUnderdog ? game.homeTeam.name : isAwayUnderdog ? game.awayTeam.name : null,
          underdogValue: Math.abs(Number(game.spread))
        };
      });
      
      res.json(formattedGames);
    } catch (error) {
      console.error("Error getting NFL games for week:", error);
      res.status(500).json({ message: "Failed to fetch NFL games for week" });
    }
  });
  
  // Get NFL games for a specific week (generic route - must be after more specific routes)
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
      const userId = req.user.id;
      const leagues = await storage.getUserLeagues(userId);
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching user leagues:", error);
      res.status(500).json({ message: "Failed to fetch user leagues" });
    }
  });

  // Create a new league
  app.post('/api/leagues', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { name, description } = req.body;
      
      // Validate input
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: "League name is required" });
      }
      
      if (name.trim().length > 100) {
        return res.status(400).json({ message: "League name must be 100 characters or less" });
      }
      
      // Create the league
      const newLeague = await storage.createLeague({
        name: name.trim(),
        description: description?.trim() || null,
      });
      
      // Add the creator as an admin member
      await storage.addLeagueMember({
        leagueId: newLeague.id,
        userId,
        isAdmin: true,
        isActive: true,
      });
      
      res.status(201).json(newLeague);
    } catch (error) {
      console.error("Error creating league:", error);
      res.status(500).json({ message: "Failed to create league" });
    }
  });

  // Join a league by invite code
  app.post('/api/leagues/join', isAuthenticated, async (req: any, res) => {
    try {
      const { inviteCode } = req.body;
      const userId = req.user.id;
      
      if (!inviteCode || inviteCode.trim().length === 0) {
        return res.status(400).json({ message: "Invite code is required" });
      }
      
      // Find league by invite code
      const league = await storage.getLeagueByInviteCode(inviteCode.trim().toUpperCase());
      if (!league) {
        return res.status(404).json({ message: "Invalid invite code" });
      }
      
      // Check if user is already a member
      const existingMember = await storage.getLeagueMember(league.id, userId);
      if (existingMember) {
        return res.status(400).json({ message: "You are already a member of this league" });
      }
      
      // Add user to league
      const newMember = await storage.addLeagueMember({
        leagueId: league.id,
        userId,
        isAdmin: false,
        isActive: true,
      });
      
      res.json({
        message: `Successfully joined ${league.name}`,
        league,
        member: newMember
      });
    } catch (error) {
      console.error("Error joining league:", error);
      res.status(500).json({ message: "Failed to join league" });
    }
  });

  // Join a league (legacy endpoint)
  app.post('/api/leagues/:id/join', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      if (isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league ID" });
      }

      const userId = req.user.id;
      
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

  // Get a user's pick for a specific week (or current week if not specified)
  app.get('/api/user/pick', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Default to NFL Upset Pool league (ID 1)
      const leagueId = parseInt(req.query.leagueId as string) || 1;
      
      // Check if weekId is provided in query params
      let weekId: number;
      if (req.query.weekId) {
        weekId = parseInt(req.query.weekId as string);
        if (isNaN(weekId)) {
          return res.status(400).json({ message: "Invalid week ID" });
        }
      } else {
        // Get current week as fallback
        const currentWeek = await storage.getCurrentNFLWeek();
        if (!currentWeek) {
          return res.status(404).json({ message: "No active NFL week found" });
        }
        weekId = currentWeek.id;
      }
      
      const pick = await storage.getUserPick(userId, weekId, leagueId);
      res.json(pick || null);
    } catch (error) {
      console.error("Error fetching user pick:", error);
      res.status(500).json({ message: "Failed to fetch user pick" });
    }
  });
  
  // Get all users' picks for a specific week and league
  app.get('/api/league/:leagueId/week/:weekId/picks', async (req, res) => {
    try {
      const leagueId = parseInt(req.params.leagueId);
      const weekId = parseInt(req.params.weekId);
      
      if (isNaN(leagueId) || isNaN(weekId)) {
        return res.status(400).json({ message: "Invalid league ID or week ID" });
      }
      
      // Get all picks for the week and league
      const picks = await storage.getUserPicksForWeek(weekId, leagueId);
      
      res.json(picks || []);
    } catch (error) {
      console.error("Error fetching picks for week:", error);
      res.status(500).json({ message: "Failed to fetch picks for week" });
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
      const userId = req.user.id;
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
  
  // Admin route to fetch NFL games from API for the current week
  app.post('/api/admin/games/fetch-from-api', isAuthenticated, async (req: any, res) => {
    try {
      const { weekId } = req.body;
      
      console.log("Fetch from API route called", { weekId, user: req.user });
      
      if (!weekId || isNaN(parseInt(weekId))) {
        return res.status(400).json({ message: "Invalid week ID" });
      }
      
      // Check if user is an admin for any league
      const userId = req.user.id;
      console.log("Checking admin status for user:", userId);
      const userLeagues = await storage.getUserLeagues(userId);
      console.log("User leagues:", userLeagues);
      const isAdmin = userLeagues.some(ul => ul.isAdmin);
      
      if (!isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin access required" });
      }
      
      // Get the week
      const week = await storage.getNFLWeek(parseInt(weekId));
      if (!week) {
        return res.status(404).json({ message: "NFL week not found" });
      }
      
      // Check for API key
      const apiKey = process.env.THE_ODDS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "The Odds API key not configured" });
      }
      
      // Get NFL teams for mapping
      const teams = await storage.getNFLTeams();
      const teamNameMap = new Map();
      teams.forEach(team => {
        teamNameMap.set(team.name.toLowerCase(), team);
      });
      
      // Fetch odds from The Odds API (using DraftKings)
      const response = await fetch(
        `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${apiKey}&regions=us&markets=spreads&bookmakers=draftkings&oddsFormat=american`
      );
      
      if (!response.ok) {
        return res.status(response.status).json({ 
          message: `Failed to fetch from The Odds API: ${response.statusText}` 
        });
      }
      
      const gamesData = await response.json();
      
      // Track results
      const results = {
        gamesCreated: 0,
        gamesUpdated: 0,
        errors: 0
      };
      
      // Process each game
      for (const game of gamesData) {
        try {
          // Find DraftKings bookmaker
          const dkBookmaker = game.bookmakers.find(b => b.key === 'draftkings');
          if (!dkBookmaker) {
            console.log(`No DraftKings odds for game: ${game.home_team} vs ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          // Find spreads market
          const spreadsMarket = dkBookmaker.markets.find(m => m.key === 'spreads');
          if (!spreadsMarket) {
            console.log(`No spreads market for game: ${game.home_team} vs ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
          if (!homeOutcome) {
            console.log(`No home team outcome for game: ${game.home_team} vs ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          const homeSpread = parseFloat(homeOutcome.point) || 0;
          console.log(`Game: ${game.home_team} vs ${game.away_team}, Spread: ${homeSpread}`);
          
          // Find teams
          const homeTeam = teamNameMap.get(game.home_team.toLowerCase());
          const awayTeam = teamNameMap.get(game.away_team.toLowerCase());
          
          if (!homeTeam) {
            console.log(`Home team not found: ${game.home_team}`);
            results.errors++;
            continue;
          }
          
          if (!awayTeam) {
            console.log(`Away team not found: ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          // Check if game already exists
          const existingGames = await db.select().from(nflGames).where(
            and(
              eq(nflGames.weekId, week.id),
              eq(nflGames.homeTeamId, homeTeam.id),
              eq(nflGames.awayTeamId, awayTeam.id)
            )
          );
          
          if (existingGames.length > 0) {
            // Update existing game
            const gameId = existingGames[0].id;
            await db.update(nflGames)
              .set({
                spread: homeSpread,
                gameTime: new Date(game.commence_time),
                updatedAt: new Date()
              })
              .where(eq(nflGames.id, gameId));
            
            console.log(`Updated game ID ${gameId}: ${homeTeam.name} vs ${awayTeam.name}`);
            results.gamesUpdated++;
          } else {
            // Create new game
            try {
              const [newGame] = await db.insert(nflGames).values({
                weekId: week.id,
                homeTeamId: homeTeam.id,
                awayTeamId: awayTeam.id,
                spread: homeSpread,
                homeTeamRecord: "0-0",
                awayTeamRecord: "0-0",
                gameTime: new Date(game.commence_time),
                completed: false,
                createdAt: new Date(),
                updatedAt: new Date()
              }).returning();
              
              console.log(`Created game ID ${newGame.id}: ${homeTeam.name} vs ${awayTeam.name}`);
              results.gamesCreated++;
            } catch (insertError) {
              console.error(`Error inserting game ${homeTeam.name} vs ${awayTeam.name}:`, insertError);
              results.errors++;
            }
          }
        } catch (error) {
          console.error(`Error processing game:`, error);
          results.errors++;
        }
      }
      
      return res.json({
        message: `Successfully processed NFL games for Week ${week.weekNumber}`,
        weekId: week.id,
        weekNumber: week.weekNumber,
        created: results.gamesCreated,
        updated: results.gamesUpdated,
        errors: results.errors
      });
    } catch (error) {
      console.error("Error fetching NFL games from API:", error);
      return res.status(500).json({ message: "Failed to fetch NFL games from API" });
    }
  });

  // Testing endpoint: Pull preseason games for today
  app.post('/api/admin/testing/fetch-preseason-games', isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is a super user
      const userId = req.user.id;
      if (userId !== "user_1753731196994_qfjmyp5i2") {
        return res.status(403).json({ message: "Unauthorized: Super user access required" });
      }

      const currentYear = new Date().getFullYear();
      const today = new Date();
      const todayFormatted = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD format
      
      // Fetch preseason games from ESPN API for today
      const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${todayFormatted}&seasontype=1`; // seasontype=1 for preseason
      console.log(`[Testing] Fetching preseason games from: ${espnUrl}`);
      
      const response = await fetch(espnUrl);
      
      if (!response.ok) {
        return res.status(response.status).json({ 
          message: `Failed to fetch from ESPN API: ${response.statusText}` 
        });
      }
      
      const espnData = await response.json();
      
      // Get NFL teams for mapping
      const teams = await storage.getNFLTeams();
      const teamNameMap = new Map();
      teams.forEach(team => {
        teamNameMap.set(team.name.toLowerCase(), team);
        teamNameMap.set(team.abbreviation?.toLowerCase(), team);
      });
      
      // Create a test week for preseason games
      const testWeek = await db.select().from(nflWeeks).where(eq(nflWeeks.weekNumber, 999)); // Use week 999 for testing
      let weekId;
      
      if (testWeek.length === 0) {
        // Create test week
        const newWeek = await db.insert(nflWeeks).values({
          weekNumber: 999,
          season: currentYear,
          startDate: today.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
          active: true,
          picksLockAt: new Date(today.getTime() + (24 * 60 * 60 * 1000)), // Tomorrow
          createdAt: new Date(),
          updatedAt: new Date()
        }).returning();
        weekId = newWeek[0].id;
        console.log(`[Testing] Created test week ${weekId} for preseason games`);
      } else {
        weekId = testWeek[0].id;
        console.log(`[Testing] Using existing test week ${weekId}`);
      }
      
      // Track results
      const results = {
        gamesFound: espnData.events?.length || 0,
        gamesCreated: 0,
        gamesUpdated: 0,
        errors: 0
      };
      
      // Process each game from ESPN
      for (const event of espnData.events || []) {
        try {
          const competition = event.competitions[0];
          const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
          const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
          
          if (!homeTeam || !awayTeam) {
            console.log(`[Testing] Missing team data for game: ${event.name}`);
            results.errors++;
            continue;
          }
          
          // Find teams in our database
          const dbHomeTeam = teamNameMap.get(homeTeam.team.displayName.toLowerCase()) || 
                           teamNameMap.get(homeTeam.team.abbreviation.toLowerCase());
          const dbAwayTeam = teamNameMap.get(awayTeam.team.displayName.toLowerCase()) || 
                           teamNameMap.get(awayTeam.team.abbreviation.toLowerCase());
          
          if (!dbHomeTeam || !dbAwayTeam) {
            console.log(`[Testing] Teams not found: ${homeTeam.team.displayName} vs ${awayTeam.team.displayName}`);
            results.errors++;
            continue;
          }
          
          // Parse game time
          const gameTime = new Date(competition.date);
          
          // Create a simple spread for testing (alternate between +3.5 and -3.5)
          const spread = (results.gamesCreated % 2 === 0) ? "3.5" : "-3.5";
          
          // Check if game already exists
          const existingGame = await db.select().from(nflGames).where(
            and(
              eq(nflGames.weekId, weekId),
              eq(nflGames.homeTeamId, dbHomeTeam.id),
              eq(nflGames.awayTeamId, dbAwayTeam.id)
            )
          );
          
          if (existingGame.length === 0) {
            // Create new game
            const newGame = await db.insert(nflGames).values({
              weekId: weekId,
              homeTeamId: dbHomeTeam.id,
              awayTeamId: dbAwayTeam.id,
              gameTime: gameTime.toISOString(),
              spread: spread,
              completed: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }).returning();
            
            console.log(`[Testing] Created preseason game: ${dbAwayTeam.name} @ ${dbHomeTeam.name} (${gameTime.toLocaleString()})`);
            results.gamesCreated++;
          } else {
            console.log(`[Testing] Game already exists: ${dbAwayTeam.name} @ ${dbHomeTeam.name}`);
            results.gamesUpdated++;
          }
          
        } catch (error) {
          console.error(`[Testing] Error processing game:`, error);
          results.errors++;
        }
      }
      
      return res.json({
        message: `Successfully processed preseason games for testing`,
        weekId: weekId,
        weekNumber: 999,
        created: results.gamesCreated,
        updated: results.gamesUpdated,
        found: results.gamesFound,
        errors: results.errors
      });
    } catch (error) {
      console.error("[Testing] Error fetching preseason games:", error);
      return res.status(500).json({ message: "Failed to fetch preseason games" });
    }
  });

  // Testing endpoint: Schedule preseason results pull for tomorrow 7am
  app.post('/api/admin/testing/schedule-preseason-results', isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is a super user
      const userId = req.user.id;
      if (userId !== "user_1753731196994_qfjmyp5i2") {
        return res.status(403).json({ message: "Unauthorized: Super user access required" });
      }
      
      // Calculate tomorrow at 7 AM Eastern Time
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(11, 0, 0, 0); // 11 AM UTC = 7 AM EDT (during DST)
      
      // Schedule the job
      const cronExpression = `0 11 ${tomorrow.getDate()} ${tomorrow.getMonth() + 1} *`; // 11:00 UTC tomorrow
      
      const cron = require('node-cron');
      const scheduledJob = cron.schedule(cronExpression, async () => {
        console.log('[Testing] Executing scheduled preseason results pull...');
        
        try {
          // Pull results for test week (999)
          const testWeek = await db.select().from(nflWeeks).where(eq(nflWeeks.weekNumber, 999));
          
          if (testWeek.length > 0) {
            const weekId = testWeek[0].id;
            const todayFormatted = new Date().toISOString().split('T')[0].replace(/-/g, '');
            
            // Fetch preseason results
            const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${todayFormatted}&seasontype=1`;
            const response = await fetch(espnUrl);
            
            if (response.ok) {
              const espnData = await response.json();
              
              // Process results (similar to regular results processing)
              const teams = await storage.getNFLTeams();
              const teamNameMap = new Map();
              teams.forEach(team => {
                teamNameMap.set(team.name.toLowerCase(), team);
                teamNameMap.set(team.abbreviation?.toLowerCase(), team);
              });
              
              let gamesUpdated = 0;
              
              for (const event of espnData.events || []) {
                const competition = event.competitions[0];
                const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
                const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
                
                if (homeTeam && awayTeam && competition.status.type.completed) {
                  const dbHomeTeam = teamNameMap.get(homeTeam.team.displayName.toLowerCase()) || 
                                   teamNameMap.get(homeTeam.team.abbreviation.toLowerCase());
                  const dbAwayTeam = teamNameMap.get(awayTeam.team.displayName.toLowerCase()) || 
                                   teamNameMap.get(awayTeam.team.abbreviation.toLowerCase());
                  
                  if (dbHomeTeam && dbAwayTeam) {
                    const homeScore = parseInt(homeTeam.score);
                    const awayScore = parseInt(awayTeam.score);
                    const winningTeamId = homeScore > awayScore ? dbHomeTeam.id : dbAwayTeam.id;
                    
                    const existingGames = await db.select().from(nflGames).where(
                      and(
                        eq(nflGames.weekId, weekId),
                        eq(nflGames.homeTeamId, dbHomeTeam.id),
                        eq(nflGames.awayTeamId, dbAwayTeam.id)
                      )
                    );
                    
                    if (existingGames.length > 0) {
                      const gameId = existingGames[0].id;
                      
                      await db.update(nflGames)
                        .set({
                          homeTeamScore: homeScore,
                          awayTeamScore: awayScore,
                          completed: true,
                          winningTeamId: winningTeamId,
                          updatedAt: new Date()
                        })
                        .where(eq(nflGames.id, gameId));
                      
                      // Process user picks
                      await storage.processGameResults(gameId);
                      gamesUpdated++;
                      
                      console.log(`[Testing] Updated preseason game result: ${dbAwayTeam.name} @ ${dbHomeTeam.name} (${awayScore}-${homeScore})`);
                    }
                  }
                }
              }
              
              console.log(`[Testing] Preseason results pull completed. Updated ${gamesUpdated} games.`);
            }
          }
        } catch (error) {
          console.error('[Testing] Error in scheduled preseason results pull:', error);
        }
      }, {
        timezone: 'America/New_York'
      });
      
      return res.json({
        message: `Scheduled preseason results pull for tomorrow at 7:00 AM Eastern Time`,
        scheduledTime: tomorrow.toISOString(),
        cronExpression: cronExpression
      });
      
    } catch (error) {
      console.error("[Testing] Error scheduling preseason results:", error);
      return res.status(500).json({ message: "Failed to schedule preseason results" });
    }
  });

  // Admin route to fetch NFL game results from ESPN API
  app.post('/api/admin/games/fetch-results', isAuthenticated, async (req: any, res) => {
    try {
      const { weekId } = req.body;
      
      console.log("Fetch results route called", { weekId, user: req.user });
      
      if (!weekId || isNaN(parseInt(weekId))) {
        return res.status(400).json({ message: "Invalid week ID" });
      }
      
      // Check if user is an admin for any league
      const userId = req.user.id;
      const userLeagues = await storage.getUserLeagues(userId);
      const isAdmin = userLeagues.some(ul => ul.isAdmin);
      
      if (!isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin access required" });
      }
      
      // Get the week
      const week = await storage.getNFLWeek(parseInt(weekId));
      if (!week) {
        return res.status(404).json({ message: "NFL week not found" });
      }
      
      // Get current season year
      const currentYear = new Date().getFullYear();
      
      // Fetch game results from ESPN API
      const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${currentYear}&seasontype=2&week=${week.weekNumber}`;
      const response = await fetch(espnUrl);
      
      if (!response.ok) {
        return res.status(response.status).json({ 
          message: `Failed to fetch from ESPN API: ${response.statusText}` 
        });
      }
      
      const espnData = await response.json();
      
      // Get NFL teams for mapping
      const teams = await storage.getNFLTeams();
      const teamNameMap = new Map();
      teams.forEach(team => {
        teamNameMap.set(team.name.toLowerCase(), team);
        // Also add common ESPN variations
        teamNameMap.set(team.abbreviation?.toLowerCase(), team);
      });
      
      // Track results
      const results = {
        gamesFound: espnData.events?.length || 0,
        gamesUpdated: 0,
        errors: 0
      };
      
      // Process each game from ESPN
      for (const event of espnData.events || []) {
        try {
          const competition = event.competitions[0];
          const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
          const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
          
          if (!homeTeam || !awayTeam) {
            console.log(`Missing team data for game: ${event.name}`);
            results.errors++;
            continue;
          }
          
          // Find teams in our database
          const dbHomeTeam = teamNameMap.get(homeTeam.team.displayName.toLowerCase()) || 
                           teamNameMap.get(homeTeam.team.abbreviation.toLowerCase());
          const dbAwayTeam = teamNameMap.get(awayTeam.team.displayName.toLowerCase()) || 
                           teamNameMap.get(awayTeam.team.abbreviation.toLowerCase());
          
          if (!dbHomeTeam || !dbAwayTeam) {
            console.log(`Teams not found in database: ${homeTeam.team.displayName} vs ${awayTeam.team.displayName}`);
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
              
              console.log(`Updated game results for ${dbHomeTeam.name} vs ${dbAwayTeam.name}: ${homeScore}-${awayScore}`);
              
              // Process user picks for this game
              await storage.processGameResults(gameId);
              results.gamesUpdated++;
            } else {
              console.log(`Game not found in database: ${dbHomeTeam.name} vs ${dbAwayTeam.name}`);
              results.errors++;
            }
          }
        } catch (error) {
          console.error(`Error processing game result:`, error);
          results.errors++;
        }
      }
      
      res.json({
        message: `Successfully updated ${results.gamesUpdated} game results for Week ${week.weekNumber}`,
        results
      });
    } catch (error) {
      console.error("Error fetching NFL game results:", error);
      res.status(500).json({ message: "Failed to fetch NFL game results" });
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
  
  // Super user only route to set game winner and calculate points
  app.post('/api/games/:id/result', isAuthenticated, isSuperUser, async (req: any, res) => {
    try {
      const gameId = parseInt(req.params.id);
      const { winningTeamId } = req.body;
      
      if (isNaN(gameId)) {
        return res.status(400).json({ message: "Invalid game ID" });
      }
      
      if (!winningTeamId || isNaN(parseInt(winningTeamId))) {
        return res.status(400).json({ message: "Valid winning team ID is required" });
      }
      
      // Get the game to verify it exists and the team is valid
      const game = await storage.getNFLGame(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      
      // Verify the winning team is one of the teams in this game
      if (winningTeamId !== game.homeTeamId && winningTeamId !== game.awayTeamId) {
        return res.status(400).json({ 
          message: "Winning team must be one of the teams playing in this game" 
        });
      }
      
      // Update game result and calculate user points
      const updatedGame = await storage.updateGameResult(gameId, winningTeamId);
      
      if (!updatedGame) {
        return res.status(500).json({ message: "Failed to update game result" });
      }
      
      res.json({
        message: "Game result updated successfully and user points calculated",
        gameId,
        winningTeamId,
        completed: true
      });
    } catch (error) {
      console.error("Error updating game result:", error);
      res.status(500).json({ message: "Failed to update game result" });
    }
  });

  // Clear/delete game result
  app.delete('/api/games/:id/result', isAuthenticated, isSuperUser, async (req: any, res) => {
    try {
      const gameId = parseInt(req.params.id);
      
      if (isNaN(gameId)) {
        return res.status(400).json({ message: "Invalid game ID" });
      }
      
      // Get the game to verify it exists
      const game = await storage.getNFLGame(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      
      // Clear the game result
      const clearedGame = await storage.clearGameResult(gameId);
      
      if (!clearedGame) {
        return res.status(500).json({ message: "Failed to clear game result" });
      }
      
      res.json({
        message: "Game result cleared successfully and user points recalculated",
        gameId,
        completed: false,
        winningTeamId: null
      });
    } catch (error) {
      console.error("Error clearing game result:", error);
      res.status(500).json({ message: "Failed to clear game result" });
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
  
  // Sync NFL games from The Odds API to our database - improved version
  app.get('/api/sync-nfl-games', async (req, res) => {
    try {
      // Get current week
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }
      
      console.log(`Current week: ${currentWeek.weekNumber} (ID: ${currentWeek.id})`);
      
      // Get the odds data from the API
      const apiKey = process.env.THE_ODDS_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ message: "THE_ODDS_API_KEY not found in environment" });
      }
      
      console.log("Fetching data from The Odds API...");
      const response = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?regions=us&markets=spreads&apiKey=${apiKey}&bookmakers=draftkings`);
      
      if (!response.ok) {
        return res.status(response.status).json({ message: `Odds API returned status: ${response.status}` });
      }
      
      const oddsData = await response.json();
      console.log(`Successfully fetched ${oddsData.length} NFL games from The Odds API`);
      
      // Ensure all NFL teams exist in the database
      const teams = await storage.getNFLTeams();
      console.log(`Found ${teams.length} NFL teams in database`);
      
      if (teams.length < 32) {
        // Not all teams exist, we need to seed them
        console.log("Not all NFL teams exist in database, please seed them first");
        return res.status(400).json({ message: "Not all NFL teams exist in database, please seed them first" });
      }
      
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
      
      console.log("Processing games from The Odds API...");
      // Process each game from the API
      for (const game of oddsData) {
        try {
          // Get the spread information - search through all bookmakers to find DraftKings
          const draftKings = game.bookmakers.find(b => b.key === 'draftkings');
          const bookmaker = draftKings || game.bookmakers[0]; // Fallback to first bookmaker if DraftKings not found
          
          if (!bookmaker) {
            console.log(`No bookmaker data for game: ${game.home_team} vs ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          const spreadsMarket = bookmaker.markets.find(m => m.key === 'spreads');
          if (!spreadsMarket) {
            console.log(`No spreads market for game: ${game.home_team} vs ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
          if (!homeOutcome) {
            console.log(`No home team outcome for game: ${game.home_team} vs ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          const homeSpread = parseFloat(homeOutcome.point) || 0;
          console.log(`Game: ${game.home_team} vs ${game.away_team}, Spread: ${homeSpread}`);
          
          // Get team records from our database using the map for faster lookup
          const homeTeam = teamNameMap.get(game.home_team.toLowerCase());
          const awayTeam = teamNameMap.get(game.away_team.toLowerCase());
          
          if (!homeTeam) {
            console.log(`Home team not found: ${game.home_team}`);
            results.errors++;
            continue;
          }
          
          if (!awayTeam) {
            console.log(`Away team not found: ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          // Insert directly using SQL for more reliable operation
          try {
            // Check if game exists using a direct SQL query
            const { rows: existingGames } = await pool.query(`
              SELECT id 
              FROM nfl_games 
              WHERE week_id = $1 AND home_team_id = $2 AND away_team_id = $3
            `, [currentWeek.id, homeTeam.id, awayTeam.id]);
            
            if (existingGames.length > 0) {
              // Update existing game
              const gameId = existingGames[0].id;
              await pool.query(`
                UPDATE nfl_games 
                SET spread = $1, game_time = $2, updated_at = NOW()
                WHERE id = $3
              `, [homeSpread, game.commence_time, gameId]);
              
              console.log(`Updated game ID ${gameId}: ${homeTeam.name} vs ${awayTeam.name}`);
              results.gamesUpdated++;
            } else {
              // Create new game
              const { rows } = await pool.query(`
                INSERT INTO nfl_games 
                  (week_id, home_team_id, away_team_id, spread, home_team_record, away_team_record, game_time, completed, created_at, updated_at)
                VALUES 
                  ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                RETURNING id
              `, [
                currentWeek.id,
                homeTeam.id,
                awayTeam.id,
                homeSpread,
                "0-0",
                "0-0",
                game.commence_time,
                false
              ]);
              
              if (rows.length > 0) {
                console.log(`Created game ID ${rows[0].id}: ${homeTeam.name} vs ${awayTeam.name}`);
                results.gamesCreated++;
              } else {
                console.log(`Failed to create game: ${homeTeam.name} vs ${awayTeam.name}`);
                results.errors++;
              }
            }
          } catch (sqlError) {
            console.error(`SQL error processing game ${game.home_team} vs ${game.away_team}:`, sqlError);
            results.errors++;
          }
        } catch (error) {
          console.error(`Error processing game ${game.home_team} vs ${game.away_team}:`, error);
          results.errors++;
        }
      }
      
      // Return overall results
      return res.json({
        message: "NFL games sync completed",
        results
      });
    } catch (error) {
      console.error("Error syncing NFL games:", error);
      return res.status(500).json({ message: "Failed to sync NFL games" });
    }
  });
  
  // Submit a pick for the current week
  app.post('/api/user/pick', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      console.log("Pick submission received:", req.body);
      
      // Parse the incoming data safely
      const gameId = parseInt(req.body.gameId);
      const pickedTeamId = parseInt(req.body.pickedTeamId);
      const leagueId = parseInt(req.body.leagueId);
      const weekId = parseInt(req.body.weekId);
      
      // Check if user is an active member of the league
      const leagueMember = await storage.getLeagueMember(leagueId, userId);
      if (!leagueMember) {
        return res.status(403).json({ message: "You are not a member of this league" });
      }
      
      if (!leagueMember.isActive) {
        return res.status(403).json({ message: "Your team is not activated. Contact your league admin to start picking upsets." });
      }
      
      console.log(`Parsed pick data - Game ID: ${gameId}, Team ID: ${pickedTeamId}, League ID: ${leagueId}, Week ID: ${weekId}`);
      
      // Validate the basic data
      if (isNaN(gameId) || isNaN(pickedTeamId) || isNaN(leagueId) || isNaN(weekId)) {
        return res.status(400).json({ message: "Invalid pick data: missing or invalid fields" });
      }
      
      // Get current week
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }
      
      // Make sure the week matches the current week
      if (weekId !== currentWeek.id) {
        return res.status(400).json({ message: "Pick must be for the current week" });
      }
      
      // Check if the pick lock time has passed (using server time - cannot be bypassed by client clock manipulation)
      const now = new Date();
      const lockTime = new Date(currentWeek.picksLockAt);
      if (now > lockTime) {
        return res.status(400).json({ message: "Picks are locked for this week" });
      }
      
      // Try to find the game in the database
      const dbGame = await storage.getNFLGame(gameId);
      
      if (!dbGame) {
        console.log(`Game not found with ID: ${gameId}`);
        return res.status(404).json({ 
          message: "Game not found. Please select a valid game.",
          details: { requestedGameId: gameId, weekId }
        });
      }
      
      // Check if the individual game has already started (using server time - cannot be bypassed by client clock manipulation)
      const gameKickoffTime = new Date(dbGame.gameTime);
      if (now > gameKickoffTime) {
        return res.status(400).json({ 
          message: "This game has already started and is no longer available for picks",
          details: { 
            gameTime: dbGame.gameTime,
            homeTeam: dbGame.homeTeam.name,
            awayTeam: dbGame.awayTeam.name
          }
        });
      }
      
      console.log(`Found game: ${dbGame.id} - ${dbGame.homeTeam.name} vs ${dbGame.awayTeam.name}`);
      
      // Validate that picked team is part of the game
      if (dbGame.homeTeamId !== pickedTeamId && dbGame.awayTeamId !== pickedTeamId) {
        return res.status(400).json({ 
          message: "Selected team is not part of the chosen game",
          details: {
            pickedTeamId,
            homeTeamId: dbGame.homeTeamId,
            homeTeamName: dbGame.homeTeam.name,
            awayTeamId: dbGame.awayTeamId,
            awayTeamName: dbGame.awayTeam.name
          }
        });
      }
      
      // Determine values of the pick
      const isHomeTeam = dbGame.homeTeamId === pickedTeamId;
      const isAwayTeam = dbGame.awayTeamId === pickedTeamId;
      const teamName = isHomeTeam ? dbGame.homeTeam.name : dbGame.awayTeam.name;
      
      // Figure out if picked team is underdog and what the spread value is
      // Spread convention: positive = home team is underdog, negative = away team is underdog
      const isHomeUnderdog = Number(dbGame.spread) > 0;
      const isAwayUnderdog = Number(dbGame.spread) < 0;
      const pickedTeamIsUnderdog = (isHomeTeam && isHomeUnderdog) || (isAwayTeam && isAwayUnderdog);
      const spreadValue = Math.abs(Number(dbGame.spread));
      
      console.log(`Team picked: ${teamName}, Underdog: ${pickedTeamIsUnderdog}, Spread: ${spreadValue}`);
      
      // Override the picked team to always be the underdog
      let finalPickedTeamId = pickedTeamId;
      let finalTeamName = teamName;
      let finalIsUnderdog = pickedTeamIsUnderdog;
      
      if (!pickedTeamIsUnderdog) {
        // If a favorite was submitted, switch to select the underdog instead
        if (isHomeUnderdog) {
          finalPickedTeamId = dbGame.homeTeamId;
          finalTeamName = dbGame.homeTeam.name;
          finalIsUnderdog = true;
        } else if (isAwayUnderdog) {
          finalPickedTeamId = dbGame.awayTeamId;
          finalTeamName = dbGame.awayTeam.name;
          finalIsUnderdog = true;
        }
        console.log(`Switched to underdog: ${finalTeamName} (ID: ${finalPickedTeamId})`);
      }
      
      // Check for existing pick
      const existingPick = await storage.getUserPick(userId, weekId, leagueId);
      
      // If user has an existing pick, check if their picked game has started (using server time - cannot be bypassed by client clock manipulation)
      if (existingPick && existingPick.game) {
        const existingGameKickoffTime = new Date(existingPick.game.gameTime);
        if (now > existingGameKickoffTime) {
          return res.status(400).json({ 
            message: "Error: You cannot make a new pick. Your selected game has started and you are LOCKED IN",
            details: { 
              pickedGame: `${existingPick.game.awayTeam.name} @ ${existingPick.game.homeTeam.name}`,
              gameTime: existingPick.game.gameTime
            }
          });
        }
      }
      
      if (existingPick) {
        console.log(`Updating existing pick for user ${userId}`);
        // Update existing pick with current spread
        const updatedPick = await storage.updateUserPick(existingPick.id, {
          gameId: dbGame.id,
          pickedTeamId: finalPickedTeamId,
          spreadAtTimeOfPick: String(spreadValue),
          isUnderdog: finalIsUnderdog
        });
        
        if (!updatedPick) {
          return res.status(500).json({ message: "Failed to update pick" });
        }
        
        return res.json({
          message: "Pick updated successfully",
          pick: updatedPick
        });
      } else {
        console.log(`Creating new pick for user ${userId}`);
        // Create new pick
        const newPick = await storage.createUserPick({
          userId,
          weekId,
          leagueId,
          gameId: dbGame.id,
          pickedTeamId: finalPickedTeamId,
          isUnderdog: finalIsUnderdog,
          spreadAtTimeOfPick: String(spreadValue),
          won: null,
          pointsEarned: null
        });
        
        return res.json({
          message: "Pick submitted successfully",
          pick: newPick
        });
      }
    } catch (error) {
      console.error("Error submitting pick:", error);
      return res.status(500).json({ message: "An error occurred while submitting your pick" });
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
  
  // Admin endpoint to pull games from The Odds API and populate the database
  app.post('/api/admin/pull-games', isAuthenticated, async (req: any, res) => {
    try {
      // Verify the user is an admin
      const userId = req.user.claims.sub;
      
      // Get active week
      const currentWeek = await storage.getCurrentNFLWeek();
      if (!currentWeek) {
        return res.status(404).json({ message: "No active NFL week found" });
      }
      
      if (!process.env.THE_ODDS_API_KEY) {
        return res.status(400).json({ message: "The Odds API key is not configured" });
      }
      
      // Fetch games from The Odds API
      const apiKey = process.env.THE_ODDS_API_KEY;
      const response = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?regions=us&markets=spreads&apiKey=${apiKey}&bookmakers=draftkings`);
      
      if (!response.ok) {
        return res.status(response.status).json({ 
          message: `Error from The Odds API: ${response.statusText}`,
          code: response.status
        });
      }
      
      const oddsData = await response.json();
      console.log(`Successfully fetched ${oddsData.length} NFL games from The Odds API`);
      
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
          const draftKings = game.bookmakers.find(b => b.key === 'draftkings');
          const bookmaker = draftKings || game.bookmakers[0]; // Fallback to first bookmaker if DraftKings not found
          
          if (!bookmaker) {
            console.log(`No bookmaker data for game: ${game.home_team} vs ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          const spreadsMarket = bookmaker.markets.find(m => m.key === 'spreads');
          if (!spreadsMarket) {
            console.log(`No spreads market for game: ${game.home_team} vs ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
          if (!homeOutcome) {
            console.log(`No home team outcome for game: ${game.home_team} vs ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          const homeSpread = parseFloat(homeOutcome.point) || 0;
          console.log(`Game: ${game.home_team} vs ${game.away_team}, Spread: ${homeSpread}`);
          
          // Find team IDs
          const homeTeam = teamNameMap.get(game.home_team.toLowerCase());
          const awayTeam = teamNameMap.get(game.away_team.toLowerCase());
          
          if (!homeTeam) {
            console.log(`Home team not found: ${game.home_team}`);
            results.errors++;
            continue;
          }
          
          if (!awayTeam) {
            console.log(`Away team not found: ${game.away_team}`);
            results.errors++;
            continue;
          }
          
          // Check if game exists
          const existingGames = await db.select().from(nflGames).where(
            and(
              eq(nflGames.weekId, currentWeek.id),
              eq(nflGames.homeTeamId, homeTeam.id),
              eq(nflGames.awayTeamId, awayTeam.id)
            )
          );
          
          if (existingGames.length > 0) {
            // Update existing game
            const gameId = existingGames[0].id;
            await db.update(nflGames)
              .set({
                spread: homeSpread,
                gameTime: game.commence_time,
                updatedAt: new Date()
              })
              .where(eq(nflGames.id, gameId));
            
            console.log(`Updated game ID ${gameId}: ${homeTeam.name} vs ${awayTeam.name}`);
            results.gamesUpdated++;
          } else {
            // Create new game
            const [newGame] = await db.insert(nflGames).values({
              weekId: currentWeek.id,
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              spread: homeSpread,
              homeTeamRecord: "0-0",
              awayTeamRecord: "0-0",
              gameTime: game.commence_time,
              completed: false,
              createdAt: new Date(),
              updatedAt: new Date()
            }).returning();
            
            console.log(`Created game ID ${newGame.id}: ${homeTeam.name} vs ${awayTeam.name}`);
            results.gamesCreated++;
          }
        } catch (error) {
          console.error(`Error processing game ${game.home_team} vs ${game.away_team}:`, error);
          results.errors++;
        }
      }
      
      return res.json({
        message: "NFL games sync completed",
        results
      });
    } catch (error) {
      console.error("Error syncing NFL games:", error);
      return res.status(500).json({ message: "Failed to sync NFL games" });
    }
  });
  
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
            
            // Try to find DraftKings data specifically
            const draftKingsBookmaker = game.bookmakers.find((b: any) => b.key === 'draftkings') || game.bookmakers[0];
            const spreadsMarket = draftKingsBookmaker.markets.find((m: any) => m.key === 'spreads');
            
            if (!spreadsMarket || spreadsMarket.outcomes.length < 2) return null;
            
            const homeOutcome = spreadsMarket.outcomes.find((o: any) => o.name === game.home_team);
            const awayOutcome = spreadsMarket.outcomes.find((o: any) => o.name === game.away_team);
            
            if (!homeOutcome || !awayOutcome) return null;
            
            // Get the actual spread from the API
            // DraftKings provides negative values for favorites and positive for underdogs
            const homeSpread = parseFloat(homeOutcome.point);
            
            // Create simple, consistent team and game IDs that match our helper functions
            const uniqueGameId = index + 1; // Simple ID starting from 1
            
            // Get team abbreviations
            const homeTeamAbbr = teamNameToAbbreviation[game.home_team] || game.home_team.substring(0, 3).toLowerCase();
            const awayTeamAbbr = teamNameToAbbreviation[game.away_team] || game.away_team.substring(0, 3).toLowerCase();
            
            // Get team colors
            const homeTeamColors = teamColors[homeTeamAbbr] || ["#1E293B", "#CBD5E1"];
            const awayTeamColors = teamColors[awayTeamAbbr] || ["#1E293B", "#CBD5E1"];
            
            // Use our consistent game ID format based on index
            const uniqueGameId2 = index + 1; // Starting from 1
            
            // Create team objects with consistent IDs
            const homeTeam = {
              id: uniqueGameId2 * 2, // Even number for home team
              name: game.home_team,
              abbreviation: homeTeamAbbr.toUpperCase(),
              logoUrl: `https://a.espncdn.com/i/teamlogos/nfl/500/${homeTeamAbbr}.png`,
              primaryColor: homeTeamColors[0],
              secondaryColor: homeTeamColors[1]
            };
            
            const awayTeam = {
              id: uniqueGameId2 * 2 + 1, // Odd number for away team
              name: game.away_team,
              abbreviation: awayTeamAbbr.toUpperCase(),
              logoUrl: `https://a.espncdn.com/i/teamlogos/nfl/500/${awayTeamAbbr}.png`,
              primaryColor: awayTeamColors[0],
              secondaryColor: awayTeamColors[1]
            };
            
            // Determine the correct NFL week based on the game date
            const gameWeekId = determineNFLWeek(game.commence_time, allWeeks) || currentWeek.id;
            
            // Calculate which team is the underdog based on the spread
            const underdogTeamId = homeSpread > 0 ? homeTeam.id : awayTeam.id;
            const underdogName = homeSpread > 0 ? game.home_team : game.away_team;
            const underdogValue = Math.abs(homeSpread);
            
            // Create game object
            return {
              id: uniqueGameId2, // Use the simple ID
              originalId: game.id, // Store original API ID
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
              awayTeam,
              // Add underdog information
              underdogTeamId,
              underdogName,
              underdogValue
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

  // Scheduler management endpoints (admin only)
  app.get('/api/admin/scheduler/status', isAuthenticated, isSuperUser, async (req: any, res) => {
    try {
      // Import scheduler and get status
      const { gameScheduler } = await import("./scheduler.js");
      const status = gameScheduler.getStatus();
      
      res.json(status);
    } catch (error) {
      console.error("Error getting scheduler status:", error);
      res.status(500).json({ message: "Failed to get scheduler status" });
    }
  });

  app.post('/api/admin/scheduler/manual-pull', isAuthenticated, isSuperUser, async (req: any, res) => {
    try {
      // Import scheduler and trigger manual pull
      const { gameScheduler } = await import("./scheduler.js");
      const result = await gameScheduler.triggerManualPull();
      
      res.json({
        message: "Manual data pull completed",
        result
      });
    } catch (error) {
      console.error("Error triggering manual pull:", error);
      res.status(500).json({ message: "Failed to trigger manual pull" });
    }
  });

  app.post('/api/admin/scheduler/test-job', isAuthenticated, isSuperUser, async (req: any, res) => {
    try {
      // Import scheduler and test the scheduled job
      const { gameScheduler } = await import("./scheduler.js");
      const result = await gameScheduler.testScheduledJob();
      
      res.json({
        message: "Scheduled job test completed",
        result
      });
    } catch (error) {
      console.error("Error testing scheduled job:", error);
      res.status(500).json({ message: "Failed to test scheduled job" });
    }
  });

  app.post('/api/admin/scheduler/test-results-job', isAuthenticated, isSuperUser, async (req: any, res) => {
    try {
      // Import scheduler and test the results job
      const { gameScheduler } = await import("./scheduler.js");
      const result = await gameScheduler.testResultsJob();
      
      res.json({
        message: "Scheduled results job test completed",
        result
      });
    } catch (error) {
      console.error("Error testing results job:", error);
      res.status(500).json({ message: "Failed to test results job" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}