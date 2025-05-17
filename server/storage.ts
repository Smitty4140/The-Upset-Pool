import { eq, and, sql, desc, asc, not, gte, lt, isNull } from "drizzle-orm";
import { db } from "./db";
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
    return await db
      .select({
        ...nflGames,
        homeTeam: nflTeams,
        awayTeam: {
          id: sql`away_team.id`,
          name: sql`away_team.name`,
          abbreviation: sql`away_team.abbreviation`,
          logoUrl: sql`away_team.logo_url`,
          primaryColor: sql`away_team.primary_color`,
          secondaryColor: sql`away_team.secondary_color`,
        },
      })
      .from(nflGames)
      .innerJoin(nflTeams, eq(nflGames.homeTeamId, nflTeams.id))
      .innerJoin(nflTeams.as('away_team'), eq(nflGames.awayTeamId, sql`away_team.id`))
      .where(eq(nflGames.weekId, weekId))
      .orderBy(nflGames.gameTime);
  }

  async getNFLGame(id: number): Promise<(NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam }) | undefined> {
    const [game] = await db
      .select({
        ...nflGames,
        homeTeam: nflTeams,
        awayTeam: {
          id: sql`away_team.id`,
          name: sql`away_team.name`,
          abbreviation: sql`away_team.abbreviation`,
          logoUrl: sql`away_team.logo_url`,
          primaryColor: sql`away_team.primary_color`,
          secondaryColor: sql`away_team.secondary_color`,
        },
      })
      .from(nflGames)
      .innerJoin(nflTeams, eq(nflGames.homeTeamId, nflTeams.id))
      .innerJoin(nflTeams.as('away_team'), eq(nflGames.awayTeamId, sql`away_team.id`))
      .where(eq(nflGames.id, id));
    
    return game;
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
      const games = await this.getNFLGames(weekId);
      return games.filter(game => {
        // If spread is positive, home team is underdog. If negative, away team is underdog.
        return game.spread !== null;
      });
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
