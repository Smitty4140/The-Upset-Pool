import { eq, and, sql, desc, asc, not, gte, lt, isNull } from "drizzle-orm";
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
  type UpsertUser,
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
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUserByUsername(username: string): Promise<User | undefined>;

  // NFL Team operations
  getNFLTeams(): Promise<NFLTeam[]>;
  getNFLTeam(id: number): Promise<NFLTeam | undefined>;
  createNFLTeam(team: InsertNFLTeam): Promise<NFLTeam>;
  updateNFLTeam(id: number, team: Partial<InsertNFLTeam>): Promise<NFLTeam | undefined>;

  // League operations
  getLeagues(): Promise<League[]>;
  getLeague(id: number): Promise<League | undefined>;
  createLeague(league: InsertLeague): Promise<League>;

  // League member operations
  getLeagueMembers(leagueId: number): Promise<(LeagueMember & { user: User })[]>;
  getUserLeagues(userId: string): Promise<(LeagueMember & { league: League })[]>;
  addLeagueMember(member: InsertLeagueMember): Promise<LeagueMember>;
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

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  // NFL Team operations
  async getNFLTeams(): Promise<NFLTeam[]> {
    return await db.select().from(nflTeams).orderBy(nflTeams.name);
  }

  async getNFLTeam(id: number): Promise<NFLTeam | undefined> {
    const [team] = await db.select().from(nflTeams).where(eq(nflTeams.id, id));
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

  async createLeague(league: InsertLeague): Promise<League> {
    const [createdLeague] = await db.insert(leagues).values(league).returning();
    return createdLeague;
  }

  // League member operations
  async getLeagueMembers(leagueId: number): Promise<(LeagueMember & { user: User })[]> {
    return await db
      .select({
        ...leagueMembers,
        user: users,
      })
      .from(leagueMembers)
      .innerJoin(users, eq(leagueMembers.userId, users.id))
      .where(eq(leagueMembers.leagueId, leagueId));
  }

  async getUserLeagues(userId: string): Promise<(LeagueMember & { league: League })[]> {
    return await db
      .select({
        ...leagueMembers,
        league: leagues,
      })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
      .where(eq(leagueMembers.userId, userId));
  }

  async addLeagueMember(member: InsertLeagueMember): Promise<LeagueMember> {
    const [createdMember] = await db
      .insert(leagueMembers)
      .values(member)
      .onConflictDoNothing({ target: [leagueMembers.leagueId, leagueMembers.userId] })
      .returning();
    return createdMember;
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
    const now = new Date();
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
        WHERE g.week_id = ${weekId}
        ORDER BY g.game_time
      `);
      
      // Transform the raw results into properly structured objects
      return result.map((game: any) => ({
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
        WHERE g.id = ${id}
      `);
      
      if (result.length === 0) return undefined;
      
      const game: any = result[0];
      
      return {
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
        WHERE g.week_id = $1 AND g.spread IS NOT NULL
        ORDER BY ABS(g.spread) DESC
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
    const [pick] = await db
      .select({
        ...userPicks,
        pickedTeam: nflTeams,
        game: {
          ...nflGames,
          homeTeam: {
            id: sql`home_team.id`,
            name: sql`home_team.name`,
            abbreviation: sql`home_team.abbreviation`,
            logoUrl: sql`home_team.logo_url`,
            primaryColor: sql`home_team.primary_color`,
            secondaryColor: sql`home_team.secondary_color`,
          },
          awayTeam: {
            id: sql`away_team.id`,
            name: sql`away_team.name`,
            abbreviation: sql`away_team.abbreviation`,
            logoUrl: sql`away_team.logo_url`,
            primaryColor: sql`away_team.primary_color`,
            secondaryColor: sql`away_team.secondary_color`,
          },
        },
      })
      .from(userPicks)
      .innerJoin(nflTeams, eq(userPicks.pickedTeamId, nflTeams.id))
      .innerJoin(nflGames, eq(userPicks.gameId, nflGames.id))
      .innerJoin(nflTeams.as('home_team'), eq(nflGames.homeTeamId, sql`home_team.id`))
      .innerJoin(nflTeams.as('away_team'), eq(nflGames.awayTeamId, sql`away_team.id`))
      .where(
        and(
          eq(userPicks.userId, userId),
          eq(userPicks.weekId, weekId),
          eq(userPicks.leagueId, leagueId)
        )
      );
    
    return pick;
  }

  async getUserPicksForWeek(weekId: number, leagueId: number): Promise<(UserPick & { user: User, pickedTeam: NFLTeam, game: NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam } })[]> {
    return await db
      .select({
        ...userPicks,
        user: users,
        pickedTeam: nflTeams,
        game: {
          ...nflGames,
          homeTeam: {
            id: sql`home_team.id`,
            name: sql`home_team.name`,
            abbreviation: sql`home_team.abbreviation`,
            logoUrl: sql`home_team.logo_url`,
            primaryColor: sql`home_team.primary_color`,
            secondaryColor: sql`home_team.secondary_color`,
          },
          awayTeam: {
            id: sql`away_team.id`,
            name: sql`away_team.name`,
            abbreviation: sql`away_team.abbreviation`,
            logoUrl: sql`away_team.logo_url`,
            primaryColor: sql`away_team.primary_color`,
            secondaryColor: sql`away_team.secondary_color`,
          },
        },
      })
      .from(userPicks)
      .innerJoin(users, eq(userPicks.userId, users.id))
      .innerJoin(nflTeams, eq(userPicks.pickedTeamId, nflTeams.id))
      .innerJoin(nflGames, eq(userPicks.gameId, nflGames.id))
      .innerJoin(nflTeams.as('home_team'), eq(nflGames.homeTeamId, sql`home_team.id`))
      .innerJoin(nflTeams.as('away_team'), eq(nflGames.awayTeamId, sql`away_team.id`))
      .where(
        and(
          eq(userPicks.weekId, weekId),
          eq(userPicks.leagueId, leagueId)
        )
      );
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
    return db
      .select({
        ...users,
      })
      .from(users)
      .innerJoin(leagueMembers, eq(users.id, leagueMembers.userId))
      .where(eq(leagueMembers.leagueId, leagueId))
      .orderBy(desc(users.totalPoints));
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
          pointsEarned: won ? pointsEarned : 0,
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
