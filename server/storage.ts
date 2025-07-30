import { eq, and, sql, desc, asc, not, gte, lt, isNull } from "drizzle-orm";

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
  // User operations (email/password auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
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
  getCurrentNFLWeek(): Promise<NFLWeek | undefined>;
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
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    
    // Automatically add new users to the default league (NFL Upset Pool - ID 1)
    try {
      console.log(`Auto-adding new user ${user.username} (${user.id}) to the NFL Upset Pool league`);
      await this.addLeagueMember({
        leagueId: 1, // Default league - NFL Upset Pool
        userId: user.id,
        isAdmin: false,
      });
    } catch (error) {
      console.error("Error adding user to default league:", error);
      // Continue with user creation even if league joining fails
    }
    
    return user;
  }

  async upsertUser(userData: Partial<InsertUser> & { id: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        id: userData.id,
        email: userData.email || '',
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
          email: userData.email || sql`${users.email}`,
          username: userData.username || sql`${users.username}`,
          firstName: userData.firstName || sql`${users.firstName}`,
          lastName: userData.lastName || sql`${users.lastName}`,
          profileImageUrl: userData.profileImageUrl || sql`${users.profileImageUrl}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Automatically add new users to the default league (NFL Upset Pool - ID 1)
    try {
      const userLeagues = await this.getUserLeagues(user.id);
      const isAlreadyInLeague = userLeagues.some(ul => ul.leagueId === 1);
      
      if (!isAlreadyInLeague) {
        console.log(`Auto-adding user ${user.username} (${user.id}) to the NFL Upset Pool league`);
        await this.addLeagueMember({
          leagueId: 1, // Default league - NFL Upset Pool
          userId: user.id,
          isAdmin: false,
        });
      }
    } catch (error) {
      console.error("Error adding user to default league:", error);
      // Continue with user creation even if league joining fails
    }

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

  async getCurrentNFLWeek(): Promise<NFLWeek | undefined> {
    const now = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
    const [week] = await db
      .select()
      .from(nflWeeks)
      .where(
        and(
          gte(nflWeeks.endDate, now),
          lt(nflWeeks.startDate, now)
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
          AND g.game_time >= w.start_date
          AND g.game_time <= (w.end_date + INTERVAL '1 day')
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
            pointsEarned,
            updatedAt: new Date()
          })
          .where(eq(userPicks.id, pick.id));
      }

      // Recalculate total points for all affected users
      const userIds = [...new Set(picks.map(pick => pick.userId))];
      for (const userId of userIds) {
        await this.recalculateUserTotalPoints(userId);
      }
    } catch (error) {
      console.error("Error calculating user pick results:", error);
    }
  }

  // Helper method to recalculate a user's total points
  async recalculateUserTotalPoints(userId: string): Promise<void> {
    try {
      const result = await db.execute(sql`
        SELECT COALESCE(SUM(points_earned), 0) as total_points
        FROM user_picks 
        WHERE user_id = ${userId} AND won = true
      `);
      
      const totalPoints = result.rows?.[0]?.total_points || 0;
      
      await db
        .update(users)
        .set({ totalPoints: String(totalPoints) })
        .where(eq(users.id, userId));
    } catch (error) {
      console.error("Error recalculating user total points:", error);
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
      // First get all user picks for this week and league
      const picks = await db
        .select()
        .from(userPicks)
        .where(
          and(
            eq(userPicks.weekId, weekId),
            eq(userPicks.leagueId, leagueId)
          )
        );
      
      // Now build the full objects with related data
      const fullPicks = [];
      
      for (const pick of picks) {
        // Get user
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, pick.userId));
        
        // Get picked team
        const [pickedTeam] = await db
          .select()
          .from(nflTeams)
          .where(eq(nflTeams.id, pick.pickedTeamId));
        
        // Get game
        const [game] = await db
          .select()
          .from(nflGames)
          .where(eq(nflGames.id, pick.gameId));
        
        // Get home team
        const [homeTeam] = await db
          .select()
          .from(nflTeams)
          .where(eq(nflTeams.id, game.homeTeamId));
        
        // Get away team
        const [awayTeam] = await db
          .select()
          .from(nflTeams)
          .where(eq(nflTeams.id, game.awayTeamId));
        
        fullPicks.push({
          ...pick,
          user,
          pickedTeam,
          game: {
            ...game,
            homeTeam,
            awayTeam,
            winningTeamId: game.winningTeamId
          }
        });
      }
      
      return fullPicks;
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

  async getLeaderboard(leagueId: number): Promise<User[]> {
    const result = await db
      .select()
      .from(users)
      .innerJoin(leagueMembers, eq(users.id, leagueMembers.userId))
      .where(eq(leagueMembers.leagueId, leagueId))
      .orderBy(desc(users.totalPoints));
    
    return result.map(row => row.users) as User[];
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
      
      // Update user's total points if they won
      if (won) {
        await db
          .update(users)
          .set({
            totalPoints: sql`${users.totalPoints} + ${pointsEarned}`,
          })
          .where(eq(users.id, pick.userId));
      }
    }
  }
}

export const storage = new DatabaseStorage();
