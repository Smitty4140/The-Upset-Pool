import { eq, and, sql, desc, asc, not, gte, lt, lte, isNull, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Generate a unique 6-character invite code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
import { db, pool } from "./db";
import { 
  users, 
  nflTeams, 
  leagues, 
  leagueMembers,
  nflWeeks,
  nflGames,
  userPicks,
  type User,
  type UserWithEligibility,
  type LastPickInfo,
  type InsertUser,
  type NFLTeam,
  type InsertNFLTeam,
  type League,
  type InsertLeague,
  type LeagueMember,
  type InsertLeagueMember,
  type NFLWeek,
  type InsertNFLWeek,
  type NFLGame,
  type InsertNFLGame,
  type UserPick,
  type InsertUserPick
} from "@shared/schema";

// Interface for storage operations
export interface IStorage {
  // User operations (email/password and Google OAuth auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(userId: string, updateData: Partial<InsertUser>): Promise<User>;
  upsertUser(user: Partial<InsertUser> & { id: string }): Promise<User>;
  getAllUsers(): Promise<User[]>;

  // NFL Team operations
  getNFLTeams(): Promise<NFLTeam[]>;
  getNFLTeam(id: number): Promise<NFLTeam | undefined>;
  getNFLTeamByName(name: string): Promise<NFLTeam | undefined>;
  createNFLTeam(team: InsertNFLTeam): Promise<NFLTeam>;
  updateNFLTeam(id: number, team: Partial<InsertNFLTeam>): Promise<NFLTeam | undefined>;

  // League operations
  getLeagues(): Promise<League[]>;
  getLeague(id: number): Promise<League | undefined>;
  getLeagueByInviteCode(inviteCode: string): Promise<League | undefined>;
  createLeague(league: InsertLeague): Promise<League>;
  updateLeague(id: number, updates: Partial<InsertLeague>): Promise<League | undefined>;

  // League member operations
  getLeagueMembers(leagueId: number): Promise<(LeagueMember & { user: User })[]>;
  getUserLeagues(userId: string): Promise<(LeagueMember & { league: League })[]>;
  getLeagueMember(leagueId: number, userId: string): Promise<LeagueMember | undefined>;
  addLeagueMember(member: InsertLeagueMember): Promise<LeagueMember>;
  addUserToLeague(leagueId: number, userId: string, isAdmin: boolean): Promise<LeagueMember>;
  updateLeagueMember(leagueId: number, userId: string, updates: Partial<InsertLeagueMember>): Promise<LeagueMember>;
  removeLeagueMember(leagueId: number, userId: string): Promise<void>;

  // NFL Week operations
  getNFLWeeks(): Promise<NFLWeek[]>;
  getNFLWeeksBySeason(season: number): Promise<NFLWeek[]>;
  getCurrentNFLWeek(): Promise<NFLWeek | undefined>;
  getCurrentNFLWeekForSeason(season: number): Promise<NFLWeek | undefined>;
  getNFLWeek(id: number): Promise<NFLWeek | undefined>;
  createNFLWeek(week: InsertNFLWeek): Promise<NFLWeek>;
  updateNFLWeek(id: number, week: Partial<InsertNFLWeek>): Promise<NFLWeek | undefined>;

  // NFL Game operations
  getNFLGames(weekId: number): Promise<(NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam })[]>;
  getNFLGame(id: number): Promise<(NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam }) | undefined>;
  createNFLGame(game: InsertNFLGame): Promise<NFLGame>;
  updateNFLGame(id: number, game: Partial<InsertNFLGame>): Promise<NFLGame | undefined>;
  updateGameResult(gameId: number, winningTeamId: number): Promise<NFLGame | undefined>;
  getUnderdogGames(weekId: number): Promise<(NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam })[]>;

  // User Pick operations
  getUserPick(userId: string, weekId: number, leagueId: number): Promise<(UserPick & { pickedTeam: NFLTeam, game: NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam } }) | undefined>;
  getUserPicksForWeek(weekId: number, leagueId: number): Promise<(UserPick & { user: User, pickedTeam: NFLTeam, game: NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam } })[]>;
  createUserPick(pick: InsertUserPick): Promise<UserPick>;
  updateUserPick(id: number, pick: Partial<InsertUserPick>): Promise<UserPick | undefined>;
  getLeaderboard(leagueId: number): Promise<User[]>;
  processGameResults(gameId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async updateUser(userId: string, updateData: Partial<InsertUser>): Promise<User> {
    const normalizedUpdateData = {
      ...updateData,
      ...(updateData.email && { email: updateData.email.toLowerCase() }),
      updatedAt: new Date()
    };
    const [user] = await db
      .update(users)
      .set(normalizedUpdateData)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const normalizedUserData = {
      ...userData,
      email: userData.email.toLowerCase()
    };
    const [user] = await db.insert(users).values(normalizedUserData).returning();
    
    // Users must manually join leagues via invite code or create their own
    return user;
  }

  async upsertUser(userData: Partial<InsertUser> & { id: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        id: userData.id,
        email: userData.email ? userData.email.toLowerCase() : '',
        password: userData.password || '',
        username: userData.username || `user_${userData.id}`,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        profileImageUrl: userData.profileImageUrl || null,
        totalPoints: userData.totalPoints || "0",
        emailVerified: userData.emailVerified || false,
        receiveNotifications: userData.receiveNotifications || true,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email ? userData.email.toLowerCase() : sql`${users.email}`,
          username: userData.username || sql`${users.username}`,
          firstName: userData.firstName || sql`${users.firstName}`,
          lastName: userData.lastName || sql`${users.lastName}`,
          profileImageUrl: userData.profileImageUrl || sql`${users.profileImageUrl}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Users must manually join leagues via invite code or create their own
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.username);
  }

  // NFL Team operations
  async getNFLTeams(): Promise<NFLTeam[]> {
    return await db.select().from(nflTeams).orderBy(nflTeams.name);
  }

  async getNFLTeam(id: number): Promise<NFLTeam | undefined> {
    const [team] = await db.select().from(nflTeams).where(eq(nflTeams.id, id));
    return team;
  }
  
  async getNFLTeamByName(name: string): Promise<NFLTeam | undefined> {
    const [team] = await db.select().from(nflTeams).where(eq(nflTeams.name, name));
    return team;
  }

  async createNFLTeam(team: InsertNFLTeam): Promise<NFLTeam> {
    const [createdTeam] = await db.insert(nflTeams).values(team).returning();
    return createdTeam;
  }

  async updateNFLTeam(id: number, team: Partial<InsertNFLTeam>): Promise<NFLTeam | undefined> {
    const [updatedTeam] = await db
      .update(nflTeams)
      .set(team)
      .where(eq(nflTeams.id, id))
      .returning();
    return updatedTeam;
  }

  // League operations
  async getLeagues(): Promise<League[]> {
    return await db.select().from(leagues);
  }

  async getLeague(id: number): Promise<League | undefined> {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, id));
    return league;
  }

  async getLeagueByInviteCode(inviteCode: string): Promise<League | undefined> {
    const [league] = await db.select().from(leagues).where(eq(leagues.inviteCode, inviteCode));
    return league;
  }

  async createLeague(league: InsertLeague): Promise<League> {
    // Generate a unique invite code
    let inviteCode = generateInviteCode();
    let attempts = 0;
    const maxAttempts = 10;
    
    // Keep trying until we get a unique code
    while (attempts < maxAttempts) {
      const existingLeague = await this.getLeagueByInviteCode(inviteCode);
      if (!existingLeague) {
        break;
      }
      inviteCode = generateInviteCode();
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      throw new Error("Could not generate unique invite code");
    }
    
    const [createdLeague] = await db.insert(leagues).values({
      ...league,
      inviteCode
    }).returning();
    return createdLeague;
  }

  // League member operations
  async getLeagueMembers(leagueId: number): Promise<(LeagueMember & { user: User })[]> {
    const result = await db
      .select()
      .from(leagueMembers)
      .innerJoin(users, eq(leagueMembers.userId, users.id))
      .where(eq(leagueMembers.leagueId, leagueId));
    
    return result.map(row => ({
      ...row.league_members,
      user: row.users
    })) as (LeagueMember & { user: User })[];
  }

  async getUserLeagues(userId: string): Promise<(LeagueMember & { league: League })[]> {
    const result = await db
      .select()
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
      .where(eq(leagueMembers.userId, userId));
    
    return result.map(row => ({
      ...row.league_members,
      league: row.leagues
    })) as (LeagueMember & { league: League })[];
  }

  async getLeagueMember(leagueId: number, userId: string): Promise<LeagueMember | undefined> {
    const [member] = await db
      .select()
      .from(leagueMembers)
      .where(
        and(
          eq(leagueMembers.leagueId, leagueId),
          eq(leagueMembers.userId, userId)
        )
      );
    return member;
  }

  async updateLeague(id: number, updates: Partial<InsertLeague>): Promise<League | undefined> {
    const [updatedLeague] = await db
      .update(leagues)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(leagues.id, id))
      .returning();
    return updatedLeague;
  }

  async addLeagueMember(member: InsertLeagueMember): Promise<LeagueMember> {
    const [createdMember] = await db
      .insert(leagueMembers)
      .values(member)
      .onConflictDoNothing({ target: [leagueMembers.leagueId, leagueMembers.userId] })
      .returning();
    return createdMember;
  }

  async addUserToLeague(leagueId: number, userId: string, isAdmin: boolean): Promise<LeagueMember> {
    return this.addLeagueMember({
      leagueId,
      userId,
      isAdmin,
    });
  }

  async updateLeagueMember(leagueId: number, userId: string, updates: Partial<InsertLeagueMember>): Promise<LeagueMember> {
    const [updatedMember] = await db
      .update(leagueMembers)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(leagueMembers.leagueId, leagueId),
          eq(leagueMembers.userId, userId)
        )
      )
      .returning();
    return updatedMember;
  }

  async removeLeagueMember(leagueId: number, userId: string): Promise<void> {
    await db
      .delete(leagueMembers)
      .where(
        and(
          eq(leagueMembers.leagueId, leagueId),
          eq(leagueMembers.userId, userId)
        )
      );
  }

  // NFL Week operations
  async getNFLWeeks(): Promise<NFLWeek[]> {
    return await db.select().from(nflWeeks).orderBy(nflWeeks.season, nflWeeks.weekNumber);
  }

  async getNFLWeeksBySeason(season: number): Promise<NFLWeek[]> {
    return await db
      .select()
      .from(nflWeeks)
      .where(eq(nflWeeks.season, season))
      .orderBy(nflWeeks.weekNumber);
  }

  async getCurrentNFLWeek(): Promise<NFLWeek | undefined> {
    const now = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
    const [week] = await db
      .select()
      .from(nflWeeks)
      .where(
        and(
          gte(nflWeeks.endDate, now),
          lte(nflWeeks.startDate, now)
        )
      )
      .limit(1);
    
    if (week) return week;
    
    // If no current week, get the next upcoming week
    const [upcomingWeek] = await db
      .select()
      .from(nflWeeks)
      .where(gte(nflWeeks.startDate, now))
      .orderBy(nflWeeks.startDate)
      .limit(1);
    
    return upcomingWeek;
  }

  async getCurrentNFLWeekForSeason(season: number): Promise<NFLWeek | undefined> {
    const now = new Date().toISOString().split('T')[0];

    // Try to find an active week in this season
    const [activeWeek] = await db
      .select()
      .from(nflWeeks)
      .where(
        and(
          eq(nflWeeks.season, season),
          gte(nflWeeks.endDate, now),
          lte(nflWeeks.startDate, now)
        )
      )
      .limit(1);

    if (activeWeek) return activeWeek;

    // Try the next upcoming week in this season
    const [upcomingWeek] = await db
      .select()
      .from(nflWeeks)
      .where(
        and(
          eq(nflWeeks.season, season),
          gte(nflWeeks.startDate, now)
        )
      )
      .orderBy(nflWeeks.startDate)
      .limit(1);

    if (upcomingWeek) return upcomingWeek;

    // Season is in the past — return the last week of that season
    const [lastWeek] = await db
      .select()
      .from(nflWeeks)
      .where(eq(nflWeeks.season, season))
      .orderBy(desc(nflWeeks.weekNumber))
      .limit(1);

    return lastWeek;
  }

  async getNFLWeek(id: number): Promise<NFLWeek | undefined> {
    const [week] = await db.select().from(nflWeeks).where(eq(nflWeeks.id, id));
    return week;
  }

  async createNFLWeek(week: InsertNFLWeek): Promise<NFLWeek> {
    const [createdWeek] = await db.insert(nflWeeks).values(week).returning();
    return createdWeek;
  }

  async updateNFLWeek(id: number, week: Partial<InsertNFLWeek>): Promise<NFLWeek | undefined> {
    const [updatedWeek] = await db
      .update(nflWeeks)
      .set(week)
      .where(eq(nflWeeks.id, id))
      .returning();
    return updatedWeek;
  }

  // NFL Game operations
  async getNFLGames(weekId: number): Promise<(NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam })[]> {
    try {
      const result = await db.execute(sql`
        SELECT 
          g.*,
          ht.id as "homeTeam_id", 
          ht.name as "homeTeam_name",
          ht.abbreviation as "homeTeam_abbreviation",
          ht.logo_url as "homeTeam_logoUrl",
          ht.primary_color as "homeTeam_primaryColor",
          ht.secondary_color as "homeTeam_secondaryColor",
          at.id as "awayTeam_id", 
          at.name as "awayTeam_name",
          at.abbreviation as "awayTeam_abbreviation",
          at.logo_url as "awayTeam_logoUrl",
          at.primary_color as "awayTeam_primaryColor",
          at.secondary_color as "awayTeam_secondaryColor"
        FROM nfl_games g
        JOIN nfl_teams ht ON g.home_team_id = ht.id
        JOIN nfl_teams at ON g.away_team_id = at.id
        JOIN nfl_weeks w ON g.week_id = w.id
        WHERE g.week_id = ${weekId}
        ORDER BY g.game_time ASC
      `);
      
      // Transform the raw results into properly structured objects
      const games = Array.isArray(result) ? result : (result?.rows || []);
      return games.map((game: any) => ({
        id: game.id,
        weekId: game.week_id,
        homeTeamId: game.home_team_id,
        awayTeamId: game.away_team_id,
        homeTeamScore: game.home_team_score,
        awayTeamScore: game.away_team_score,
        spread: game.spread,
        homeTeamRecord: game.home_team_record,
        awayTeamRecord: game.away_team_record,
        gameTime: game.game_time,
        completed: game.completed,
        winningTeamId: game.winning_team_id,
        createdAt: game.created_at,
        updatedAt: game.updated_at,
        homeTeam: {
          id: game.homeTeam_id,
          name: game.homeTeam_name,
          abbreviation: game.homeTeam_abbreviation,
          logoUrl: game.homeTeam_logoUrl,
          primaryColor: game.homeTeam_primaryColor,
          secondaryColor: game.homeTeam_secondaryColor
        },
        awayTeam: {
          id: game.awayTeam_id,
          name: game.awayTeam_name,
          abbreviation: game.awayTeam_abbreviation,
          logoUrl: game.awayTeam_logoUrl,
          primaryColor: game.awayTeam_primaryColor,
          secondaryColor: game.awayTeam_secondaryColor
        }
      }));
    } catch (error) {
      console.error("Error in getNFLGames:", error);
      return [];
    }
  }

  async getNFLGame(id: number): Promise<(NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam }) | undefined> {
    try {
      console.log(`Looking up game with ID: ${id}`);
      
      // First, get the basic game information
      const gameResult = await db.execute(sql`
        SELECT * FROM nfl_games WHERE id = ${id}
      `);
      
      if (!gameResult.rows || gameResult.rows.length === 0) {
        console.log(`No game found with ID: ${id}`);
        return undefined;
      }
      
      const gameData: any = gameResult.rows[0];
      console.log(`Found game with ID ${id}, home team: ${gameData.home_team_id}, away team: ${gameData.away_team_id}`);
      
      // Get home team data
      const homeTeamResult = await db.execute(sql`
        SELECT * FROM nfl_teams WHERE id = ${gameData.home_team_id}
      `);
      
      if (!homeTeamResult.rows || homeTeamResult.rows.length === 0) {
        console.log(`Home team not found for game ${id}, team ID: ${gameData.home_team_id}`);
        return undefined;
      }
      
      const homeTeamData: any = homeTeamResult.rows[0];
      
      // Get away team data
      const awayTeamResult = await db.execute(sql`
        SELECT * FROM nfl_teams WHERE id = ${gameData.away_team_id}
      `);
      
      if (!awayTeamResult.rows || awayTeamResult.rows.length === 0) {
        console.log(`Away team not found for game ${id}, team ID: ${gameData.away_team_id}`);
        return undefined;
      }
      
      const awayTeamData: any = awayTeamResult.rows[0];
      
      console.log(`Teams found: ${homeTeamData.name} vs ${awayTeamData.name}`);
      
      // Construct and return the full game object
      return {
        id: gameData.id,
        weekId: gameData.week_id,
        homeTeamId: gameData.home_team_id,
        awayTeamId: gameData.away_team_id,
        homeTeamScore: gameData.home_team_score,
        awayTeamScore: gameData.away_team_score,
        spread: gameData.spread,
        homeTeamRecord: gameData.home_team_record,
        awayTeamRecord: gameData.away_team_record,
        gameTime: gameData.game_time,
        completed: gameData.completed,
        winningTeamId: gameData.winning_team_id,
        createdAt: gameData.created_at,
        updatedAt: gameData.updated_at,
        homeTeam: {
          id: homeTeamData.id,
          name: homeTeamData.name,
          abbreviation: homeTeamData.abbreviation,
          logoUrl: homeTeamData.logo_url,
          primaryColor: homeTeamData.primary_color,
          secondaryColor: homeTeamData.secondary_color
        },
        awayTeam: {
          id: awayTeamData.id,
          name: awayTeamData.name,
          abbreviation: awayTeamData.abbreviation,
          logoUrl: awayTeamData.logo_url,
          primaryColor: awayTeamData.primary_color,
          secondaryColor: awayTeamData.secondary_color
        }
      };
    } catch (error) {
      console.error("Error in getNFLGame:", error);
      return undefined;
    }
  }

  async createNFLGame(game: InsertNFLGame): Promise<NFLGame> {
    const [createdGame] = await db.insert(nflGames).values(game).returning();
    return createdGame;
  }

  async updateNFLGame(id: number, game: Partial<InsertNFLGame>): Promise<NFLGame | undefined> {
    const [updatedGame] = await db
      .update(nflGames)
      .set(game)
      .where(eq(nflGames.id, id))
      .returning();
    return updatedGame;
  }

  async updateGameResult(gameId: number, winningTeamId: number): Promise<NFLGame | undefined> {
    try {
      const [updatedGame] = await db
        .update(nflGames)
        .set({ 
          winningTeamId,
          completed: true,
          updatedAt: new Date()
        })
        .where(eq(nflGames.id, gameId))
        .returning();

      // If we successfully updated the game, we should also calculate and update user pick results
      if (updatedGame) {
        await this.calculateUserPickResults(gameId, winningTeamId);
      }

      return updatedGame;
    } catch (error) {
      console.error("Error updating game result:", error);
      return undefined;
    }
  }

  async clearGameResult(gameId: number): Promise<NFLGame | undefined> {
    try {
      // Clear the game result
      const [updatedGame] = await db
        .update(nflGames)
        .set({ 
          winningTeamId: null,
          completed: false,
          homeTeamScore: null,
          awayTeamScore: null,
          updatedAt: new Date()
        })
        .where(eq(nflGames.id, gameId))
        .returning();

      // If we successfully cleared the game result, we should also clear user pick results
      if (updatedGame) {
        await this.clearUserPickResults(gameId);
      }

      return updatedGame;
    } catch (error) {
      console.error("Error clearing game result:", error);
      return undefined;
    }
  }

  // Helper method to clear user pick results when a game result is cleared
  async clearUserPickResults(gameId: number): Promise<void> {
    try {
      // Get all user picks for this game and reset their results
      await db
        .update(userPicks)
        .set({
          won: null,
          pointsEarned: "0",
          updatedAt: new Date()
        })
        .where(eq(userPicks.gameId, gameId));

      console.log(`Cleared results for all user picks on game ${gameId}`);
    } catch (error) {
      console.error("Error clearing user pick results:", error);
    }
  }

  // Helper method to calculate user pick results when a game result is set
  async calculateUserPickResults(gameId: number, winningTeamId: number): Promise<void> {
    try {
      // Get all user picks for this game
      const picks = await db.select().from(userPicks).where(eq(userPicks.gameId, gameId));
      
      // Update each pick with win/loss and points earned
      for (const pick of picks) {
        const won = pick.pickedTeamId === winningTeamId;
        const pointsEarned = won ? Math.abs(Number(pick.spreadAtTimeOfPick)) : 0;
        
        await db
          .update(userPicks)
          .set({
            won,
            pointsEarned: pointsEarned.toString(),
            updatedAt: new Date()
          })
          .where(eq(userPicks.id, pick.id));
      }

      // Note: Total points are now calculated dynamically per league, no global recalculation needed
    } catch (error) {
      console.error("Error calculating user pick results:", error);
    }
  }

  async getUnderdogGames(weekId: number): Promise<(NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam })[]> {
    try {
      // If no weekId is provided, get the current week
      if (!weekId) {
        const currentWeek = await this.getCurrentNFLWeek();
        if (!currentWeek) {
          return [];
        }
        weekId = currentWeek.id;
      }

      // Use raw query with pool to avoid Drizzle ORM issues
      const { rows } = await pool.query(`
        SELECT 
          g.*,
          ht.id AS "homeTeamId", 
          ht.name AS "homeTeamName",
          ht.abbreviation AS "homeTeamAbbreviation",
          ht.logo_url AS "homeTeamLogoUrl",
          ht.primary_color AS "homeTeamPrimaryColor",
          ht.secondary_color AS "homeTeamSecondaryColor",
          at.id AS "awayTeamId", 
          at.name AS "awayTeamName",
          at.abbreviation AS "awayTeamAbbreviation",
          at.logo_url AS "awayTeamLogoUrl",
          at.primary_color AS "awayTeamPrimaryColor",
          at.secondary_color AS "awayTeamSecondaryColor"
        FROM nfl_games g
        JOIN nfl_teams ht ON g.home_team_id = ht.id
        JOIN nfl_teams at ON g.away_team_id = at.id
        JOIN nfl_weeks w ON g.week_id = w.id
        WHERE g.week_id = $1 
          AND g.spread IS NOT NULL
          AND g.game_time >= w.start_date
          AND g.game_time <= (w.end_date + INTERVAL '1 day')
        ORDER BY g.game_time ASC
      `, [weekId]);
      
      // Transform the rows into properly structured objects
      return rows.map(game => ({
        id: game.id,
        weekId: game.week_id,
        homeTeamId: game.home_team_id,
        awayTeamId: game.away_team_id,
        homeTeamScore: game.home_team_score,
        awayTeamScore: game.away_team_score,
        spread: game.spread,
        homeTeamRecord: game.home_team_record,
        awayTeamRecord: game.away_team_record,
        gameTime: game.game_time,
        completed: game.completed,
        winningTeamId: game.winning_team_id,
        createdAt: game.created_at,
        updatedAt: game.updated_at,
        homeTeam: {
          id: game.homeTeamId,
          name: game.homeTeamName,
          abbreviation: game.homeTeamAbbreviation,
          logoUrl: game.homeTeamLogoUrl,
          primaryColor: game.homeTeamPrimaryColor,
          secondaryColor: game.homeTeamSecondaryColor
        },
        awayTeam: {
          id: game.awayTeamId,
          name: game.awayTeamName,
          abbreviation: game.awayTeamAbbreviation,
          logoUrl: game.awayTeamLogoUrl,
          primaryColor: game.awayTeamPrimaryColor,
          secondaryColor: game.awayTeamSecondaryColor
        }
      }));
    } catch (error) {
      console.error("Error getting underdog games:", error);
      return [];
    }
  }

  // User Pick operations
  async getUserPick(userId: string, weekId: number, leagueId: number): Promise<(UserPick & { pickedTeam: NFLTeam, game: NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam } }) | undefined> {
    // First get the basic user pick
    const [userPick] = await db
      .select()
      .from(userPicks)
      .where(
        and(
          eq(userPicks.userId, userId),
          eq(userPicks.weekId, weekId),
          eq(userPicks.leagueId, leagueId)
        )
      );
      
    if (!userPick) {
      return undefined;
    }
    
    // Then get the picked team
    const [pickedTeamData] = await db
      .select()
      .from(nflTeams)
      .where(eq(nflTeams.id, userPick.pickedTeamId));
      
    // Then get the game with home and away teams
    const [gameData] = await db
      .select()
      .from(nflGames)
      .where(eq(nflGames.id, userPick.gameId));
      
    if (!gameData) {
      return undefined;
    }
    
    // Get home team
    const [homeTeam] = await db
      .select()
      .from(nflTeams)
      .where(eq(nflTeams.id, gameData.homeTeamId));
      
    // Get away team
    const [awayTeam] = await db
      .select()
      .from(nflTeams)
      .where(eq(nflTeams.id, gameData.awayTeamId));
    
    // Combine all the data
    return {
      ...userPick,
      pickedTeam: pickedTeamData,
      game: {
        ...gameData,
        homeTeam,
        awayTeam
      }
    };
  }

  async getUserPicksForWeek(weekId: number, leagueId: number): Promise<(UserPick & { user: User, pickedTeam: NFLTeam, game: NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam } })[]> {
    try {
      // Use table aliases for the three team joins
      const pickedTeamAlias = alias(nflTeams, 'pickedTeam');
      const homeTeamAlias = alias(nflTeams, 'homeTeam');
      const awayTeamAlias = alias(nflTeams, 'awayTeam');
      
      // Single query with all JOINs - eliminates N+1 problem
      const results = await db
        .select({
          // Pick fields
          id: userPicks.id,
          userId: userPicks.userId,
          weekId: userPicks.weekId,
          leagueId: userPicks.leagueId,
          gameId: userPicks.gameId,
          pickedTeamId: userPicks.pickedTeamId,
          isUnderdog: userPicks.isUnderdog,
          spreadAtTimeOfPick: userPicks.spreadAtTimeOfPick,
          won: userPicks.won,
          pointsEarned: userPicks.pointsEarned,
          createdAt: userPicks.createdAt,
          // User fields
          user_id: users.id,
          user_username: users.username,
          user_email: users.email,
          user_firstName: users.firstName,
          user_lastName: users.lastName,
          user_profileImageUrl: users.profileImageUrl,
          user_emailVerified: users.emailVerified,
          user_receiveNotifications: users.receiveNotifications,
          user_createdAt: users.createdAt,
          user_updatedAt: users.updatedAt,
          user_nickname: leagueMembers.nickname,
          // Picked team fields
          pickedTeam_id: pickedTeamAlias.id,
          pickedTeam_name: pickedTeamAlias.name,
          pickedTeam_abbreviation: pickedTeamAlias.abbreviation,
          pickedTeam_logoUrl: pickedTeamAlias.logoUrl,
          pickedTeam_primaryColor: pickedTeamAlias.primaryColor,
          pickedTeam_secondaryColor: pickedTeamAlias.secondaryColor,
          // Game fields
          game_id: nflGames.id,
          game_weekId: nflGames.weekId,
          game_homeTeamId: nflGames.homeTeamId,
          game_awayTeamId: nflGames.awayTeamId,
          game_homeTeamScore: nflGames.homeTeamScore,
          game_awayTeamScore: nflGames.awayTeamScore,
          game_spread: nflGames.spread,
          game_gameTime: nflGames.gameTime,
          game_completed: nflGames.completed,
          game_winningTeamId: nflGames.winningTeamId,
          // Home team fields
          homeTeam_id: homeTeamAlias.id,
          homeTeam_name: homeTeamAlias.name,
          homeTeam_abbreviation: homeTeamAlias.abbreviation,
          homeTeam_logoUrl: homeTeamAlias.logoUrl,
          homeTeam_primaryColor: homeTeamAlias.primaryColor,
          homeTeam_secondaryColor: homeTeamAlias.secondaryColor,
          // Away team fields
          awayTeam_id: awayTeamAlias.id,
          awayTeam_name: awayTeamAlias.name,
          awayTeam_abbreviation: awayTeamAlias.abbreviation,
          awayTeam_logoUrl: awayTeamAlias.logoUrl,
          awayTeam_primaryColor: awayTeamAlias.primaryColor,
          awayTeam_secondaryColor: awayTeamAlias.secondaryColor,
        })
        .from(userPicks)
        .innerJoin(users, eq(userPicks.userId, users.id))
        .leftJoin(leagueMembers, and(
          eq(leagueMembers.userId, userPicks.userId),
          eq(leagueMembers.leagueId, userPicks.leagueId)
        ))
        .innerJoin(pickedTeamAlias, eq(userPicks.pickedTeamId, pickedTeamAlias.id))
        .innerJoin(nflGames, eq(userPicks.gameId, nflGames.id))
        .innerJoin(homeTeamAlias, eq(nflGames.homeTeamId, homeTeamAlias.id))
        .innerJoin(awayTeamAlias, eq(nflGames.awayTeamId, awayTeamAlias.id))
        .where(
          and(
            eq(userPicks.weekId, weekId),
            eq(userPicks.leagueId, leagueId)
          )
        );
      
      // Transform flat results into nested objects
      return results.map(row => ({
        id: row.id,
        userId: row.userId,
        weekId: row.weekId,
        leagueId: row.leagueId,
        gameId: row.gameId,
        pickedTeamId: row.pickedTeamId,
        isUnderdog: row.isUnderdog,
        spreadAtTimeOfPick: row.spreadAtTimeOfPick,
        won: row.won,
        pointsEarned: row.pointsEarned,
        createdAt: row.createdAt,
        user: {
          id: row.user_id,
          username: row.user_username,
          email: row.user_email,
          password: '', // Don't expose password
          firstName: row.user_firstName,
          lastName: row.user_lastName,
          profileImageUrl: row.user_profileImageUrl,
          googleId: null,
          totalPoints: '0',
          emailVerified: row.user_emailVerified,
          receiveNotifications: row.user_receiveNotifications,
          createdAt: row.user_createdAt,
          updatedAt: row.user_updatedAt,
          nickname: row.user_nickname ?? null,
        },
        pickedTeam: {
          id: row.pickedTeam_id,
          name: row.pickedTeam_name,
          abbreviation: row.pickedTeam_abbreviation,
          logoUrl: row.pickedTeam_logoUrl,
          primaryColor: row.pickedTeam_primaryColor,
          secondaryColor: row.pickedTeam_secondaryColor,
        },
        game: {
          id: row.game_id,
          weekId: row.game_weekId,
          homeTeamId: row.game_homeTeamId,
          awayTeamId: row.game_awayTeamId,
          homeTeamScore: row.game_homeTeamScore,
          awayTeamScore: row.game_awayTeamScore,
          spread: row.game_spread,
          gameTime: row.game_gameTime,
          completed: row.game_completed,
          winningTeamId: row.game_winningTeamId,
          homeTeam: {
            id: row.homeTeam_id,
            name: row.homeTeam_name,
            abbreviation: row.homeTeam_abbreviation,
            logoUrl: row.homeTeam_logoUrl,
            primaryColor: row.homeTeam_primaryColor,
            secondaryColor: row.homeTeam_secondaryColor,
          },
          awayTeam: {
            id: row.awayTeam_id,
            name: row.awayTeam_name,
            abbreviation: row.awayTeam_abbreviation,
            logoUrl: row.awayTeam_logoUrl,
            primaryColor: row.awayTeam_primaryColor,
            secondaryColor: row.awayTeam_secondaryColor,
          },
        },
      }));
    } catch (error) {
      console.error("Error fetching user picks for week:", error);
      return [];
    }
  }

  async createUserPick(pick: InsertUserPick): Promise<UserPick> {
    const [createdPick] = await db.insert(userPicks).values(pick).returning();
    return createdPick;
  }

  async updateUserPick(id: number, pick: Partial<InsertUserPick>): Promise<UserPick | undefined> {
    const [updatedPick] = await db
      .update(userPicks)
      .set(pick)
      .where(eq(userPicks.id, id))
      .returning();
    return updatedPick;
  }

  async getLeaderboard(leagueId: number): Promise<UserWithEligibility[]> {
    // First get all league members with their points
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        emailVerified: users.emailVerified,
        receiveNotifications: users.receiveNotifications,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        nickname: leagueMembers.nickname,
        totalPoints: sql<string>`COALESCE(SUM(${userPicks.pointsEarned}), 0)`.as('totalPoints')
      })
      .from(users)
      .innerJoin(leagueMembers, and(
        eq(users.id, leagueMembers.userId),
        eq(leagueMembers.leagueId, leagueId)
      ))
      .leftJoin(userPicks, and(
        eq(userPicks.userId, users.id),
        eq(userPicks.leagueId, leagueId)
      ))
      .where(eq(leagueMembers.leagueId, leagueId))
      .groupBy(users.id, users.username, users.email, users.firstName, users.lastName, users.profileImageUrl, users.emailVerified, users.receiveNotifications, users.createdAt, users.updatedAt, leagueMembers.nickname)
      .orderBy(desc(sql`COALESCE(SUM(${userPicks.pointsEarned}), 0)`));
    
    // Get weeks for eligibility calculation:
    // Only include weeks where picks have locked (picksLockAt is in the past)
    const now = new Date();
    
    // Get all weeks where picks have locked
    const eligibilityWeeks = await db
      .select()
      .from(nflWeeks)
      .where(lt(nflWeeks.picksLockAt, now))
      .orderBy(nflWeeks.weekNumber);
    
    const eligibilityWeekIds = eligibilityWeeks.map(week => week.id);
    
    // If no weeks to check, everyone is eligible
    if (eligibilityWeekIds.length === 0) {
      return result.map(user => ({
        ...user,
        everyWeekEligible: true
      })) as UserWithEligibility[];
    }
    
    // Get the most recent locked week for last pick
    const mostRecentLockedWeek = eligibilityWeeks.length > 0 
      ? eligibilityWeeks[eligibilityWeeks.length - 1] 
      : null;
    
    // Create aliases for the home and away team joins
    const homeTeam = alias(nflTeams, 'homeTeam');
    const awayTeam = alias(nflTeams, 'awayTeam');
    const pickedTeam = alias(nflTeams, 'pickedTeam');

    // ── Bulk query 1: count distinct weeks picked per user in eligible weeks ──
    // Replaces N separate per-user eligibility queries with one query for all users
    const eligibilityCountsRaw = eligibilityWeekIds.length > 0
      ? await db
          .select({
            userId: userPicks.userId,
            weeksPicked: sql<number>`COUNT(DISTINCT ${userPicks.weekId})`.as('weeks_picked')
          })
          .from(userPicks)
          .where(
            and(
              eq(userPicks.leagueId, leagueId),
              inArray(userPicks.weekId, eligibilityWeekIds)
            )
          )
          .groupBy(userPicks.userId)
      : [];

    const requiredWeeks = eligibilityWeekIds.length;
    const eligibilityMap = new Map<string, number>(
      eligibilityCountsRaw.map(r => [r.userId, Number(r.weeksPicked)])
    );

    // ── Bulk query 2: fetch all users' most-recent-week picks in one query ──
    // Replaces N separate per-user last-pick queries with one query for all users
    const lastPicksRaw = mostRecentLockedWeek
      ? await db
          .select({
            userId: userPicks.userId,
            weekNumber: nflWeeks.weekNumber,
            pickedTeamName: pickedTeam.name,
            pickedTeamAbbreviation: pickedTeam.abbreviation,
            pickedTeamLogoUrl: pickedTeam.logoUrl,
            homeTeamName: homeTeam.name,
            awayTeamName: awayTeam.name,
            homeTeamId: nflGames.homeTeamId,
            pickedTeamId: userPicks.pickedTeamId,
            spread: userPicks.spreadAtTimeOfPick,
            won: userPicks.won,
            pointsEarned: userPicks.pointsEarned,
            gameCompleted: nflGames.completed
          })
          .from(userPicks)
          .innerJoin(nflWeeks, eq(userPicks.weekId, nflWeeks.id))
          .innerJoin(nflGames, eq(userPicks.gameId, nflGames.id))
          .innerJoin(pickedTeam, eq(userPicks.pickedTeamId, pickedTeam.id))
          .innerJoin(homeTeam, eq(nflGames.homeTeamId, homeTeam.id))
          .innerJoin(awayTeam, eq(nflGames.awayTeamId, awayTeam.id))
          .where(
            and(
              eq(userPicks.leagueId, leagueId),
              eq(userPicks.weekId, mostRecentLockedWeek.id)
            )
          )
      : [];

    const lastPickMap = new Map<string, LastPickInfo>();
    for (const pick of lastPicksRaw) {
      const opponentTeamName = pick.pickedTeamId === pick.homeTeamId
        ? pick.awayTeamName
        : pick.homeTeamName;
      let pickResult: 'win' | 'loss' | 'pending' = 'pending';
      if (pick.gameCompleted) {
        pickResult = pick.won ? 'win' : 'loss';
      }
      lastPickMap.set(pick.userId, {
        weekNumber: pick.weekNumber,
        pickedTeamName: pick.pickedTeamName,
        pickedTeamAbbreviation: pick.pickedTeamAbbreviation,
        pickedTeamLogoUrl: pick.pickedTeamLogoUrl,
        opponentTeamName,
        spread: Math.abs(Number(pick.spread)),
        result: pickResult,
        pointsEarned: Number(pick.pointsEarned) || 0
      });
    }

    // ── Assemble final result entirely in-memory (no more per-user queries) ──
    const usersWithEligibility = result.map(user => {
      const weeksPicked = eligibilityMap.get(user.id) ?? 0;
      const everyWeekEligible = requiredWeeks === 0 || weeksPicked >= requiredWeeks;
      const lastPick: LastPickInfo = lastPickMap.get(user.id) ?? null;
      return { ...user, everyWeekEligible, lastPick };
    });

    return usersWithEligibility as UserWithEligibility[];
  }

  async processGameResults(gameId: number): Promise<void> {
    // Get the game
    const game = await this.getNFLGame(gameId);
    
    if (!game || !game.completed || game.homeTeamScore === null || game.awayTeamScore === null) {
      return;
    }
    
    // Determine the winning team
    const homeTeamWon = game.homeTeamScore > game.awayTeamScore;
    const awayTeamWon = game.awayTeamScore > game.homeTeamScore;
    
    // Update all picks for this game
    const picks = await db
      .select()
      .from(userPicks)
      .where(eq(userPicks.gameId, gameId));
      
    for (const pick of picks) {
      let won = false;
      let pointsEarned = 0;
      
      // Home team is underdog if spread is positive
      const homeTeamIsUnderdog = Number(game.spread) > 0;
      // Away team is underdog if spread is negative
      const awayTeamIsUnderdog = Number(game.spread) < 0;
      
      if (pick.pickedTeamId === game.homeTeamId && homeTeamWon && homeTeamIsUnderdog) {
        won = true;
        pointsEarned = Number(pick.spreadAtTimeOfPick);
      } else if (pick.pickedTeamId === game.awayTeamId && awayTeamWon && awayTeamIsUnderdog) {
        won = true;
        pointsEarned = Math.abs(Number(pick.spreadAtTimeOfPick));
      }
      
      // Update the pick with results
      await db
        .update(userPicks)
        .set({
          won,
          pointsEarned: won ? pointsEarned.toString() : "0",
        })
        .where(eq(userPicks.id, pick.id));
    }
  }
}

export const storage = new DatabaseStorage();
