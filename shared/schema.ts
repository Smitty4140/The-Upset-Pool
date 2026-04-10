import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  varchar,
  timestamp,
  jsonb,
  index,
  decimal,
  date,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for email/password and Google OAuth auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  username: varchar("username").unique(),
  email: varchar("email").notNull().unique(),
  password: varchar("password"), // Optional for Google OAuth users
  googleId: varchar("google_id").unique(), // For Google OAuth
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  totalPoints: decimal("total_points", { precision: 10, scale: 1 }).default("0").notNull(),
  emailVerified: boolean("email_verified").default(false),
  receiveNotifications: boolean("receive_notifications").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// NFL Teams table
export const nflTeams = pgTable("nfl_teams", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  abbreviation: varchar("abbreviation").notNull().unique(),
  logoUrl: varchar("logo_url").notNull(),
  primaryColor: varchar("primary_color"),
  secondaryColor: varchar("secondary_color"),
});

// Golf Tournaments table (must be defined before leagues for FK reference)
export const golfTournaments = pgTable("golf_tournaments", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  location: varchar("location"),
  season: integer("season").notNull(),
  startsAt: timestamp("starts_at"),
  picksLockAt: timestamp("picks_lock_at").notNull(),
  status: varchar("status").default("upcoming").notNull(), // 'upcoming' | 'active' | 'completed'
  picksRequired: integer("picks_required").default(4).notNull(), // configurable per tournament
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Leagues table (supports both NFL and Golf)
export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  inviteCode: varchar("invite_code", { length: 6 }).notNull().unique(),
  season: integer("season").notNull().default(sql`EXTRACT(YEAR FROM NOW())::int`),
  sportType: varchar("sport_type").default("nfl").notNull(), // 'nfl' | 'golf'
  golfTournamentId: integer("golf_tournament_id").references(() => golfTournaments.id), // null for NFL leagues
  isArchived: boolean("is_archived").default(false),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// League members
export const leagueMembers = pgTable("league_members", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull().references(() => leagues.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  isAdmin: boolean("is_admin").default(false),
  isActive: boolean("is_active").default(true), // Whether the member can make picks
  nickname: varchar("nickname"), // Per-league display name (falls back to users.username)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    leagueUserUnique: unique().on(table.leagueId, table.userId),
  };
});

// NFL Weeks table
export const nflWeeks = pgTable("nfl_weeks", {
  id: serial("id").primaryKey(),
  weekNumber: integer("week_number").notNull(),
  season: integer("season").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  active: boolean("active").default(false),
  picksLockAt: timestamp("picks_lock_at").notNull(), // Sunday 1 PM EST
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    weekSeason: unique().on(table.weekNumber, table.season),
    picksLockAtIdx: index("idx_nfl_weeks_picks_lock_at").on(table.picksLockAt),
    seasonActiveIdx: index("idx_nfl_weeks_season_active").on(table.season, table.active),
  };
});

// NFL Games table
export const nflGames = pgTable("nfl_games", {
  id: serial("id").primaryKey(),
  weekId: integer("week_id").notNull().references(() => nflWeeks.id),
  homeTeamId: integer("home_team_id").notNull().references(() => nflTeams.id),
  awayTeamId: integer("away_team_id").notNull().references(() => nflTeams.id),
  homeTeamScore: integer("home_team_score"),
  awayTeamScore: integer("away_team_score"),
  spread: decimal("spread", { precision: 4, scale: 1 }).notNull(), // Point spread with home team as reference (negative if home team is favored)
  homeTeamRecord: varchar("home_team_record"),
  awayTeamRecord: varchar("away_team_record"),
  gameTime: timestamp("game_time").notNull(),
  completed: boolean("completed").default(false),
  winningTeamId: integer("winning_team_id").references(() => nflTeams.id), // The team that won the game
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    weekIdIdx: index("idx_nfl_games_week_id").on(table.weekId),
  };
});

// User Picks table
export const userPicks = pgTable("user_picks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  leagueId: integer("league_id").notNull().references(() => leagues.id),
  weekId: integer("week_id").notNull().references(() => nflWeeks.id),
  gameId: integer("game_id").notNull().references(() => nflGames.id),
  pickedTeamId: integer("picked_team_id").notNull().references(() => nflTeams.id),
  isUnderdog: boolean("is_underdog").notNull(),
  spreadAtTimeOfPick: decimal("spread_at_time_of_pick", { precision: 4, scale: 1 }).notNull(),
  won: boolean("won"),
  pointsEarned: decimal("points_earned", { precision: 4, scale: 1 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    userWeekLeague: unique().on(table.userId, table.weekId, table.leagueId),
    leagueWeekIdx: index("idx_user_picks_league_week").on(table.leagueId, table.weekId),
    userLeagueIdx: index("idx_user_picks_user_league").on(table.userId, table.leagueId),
  };
});

// Golf Players table (individual golfers)
export const golfPlayers = pgTable("golf_players", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  country: varchar("country"),
  isAmateur: boolean("is_amateur").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Golf Tournament Field (which players are entered in which tournament, with OWGR at lock time)
export const golfTournamentField = pgTable("golf_tournament_field", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => golfTournaments.id),
  playerId: integer("player_id").notNull().references(() => golfPlayers.id),
  owgrAtLock: integer("owgr_at_lock"), // NULL = amateur with no OWGR → 200 points via COALESCE
}, (table) => ({
  tournamentPlayerUnique: unique().on(table.tournamentId, table.playerId),
}));

// Golf Picks header (one row per user per league per tournament)
export const golfPicks = pgTable("golf_picks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  leagueId: integer("league_id").notNull().references(() => leagues.id),
  tournamentId: integer("tournament_id").notNull().references(() => golfTournaments.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userLeagueTournamentUnique: unique().on(table.userId, table.leagueId, table.tournamentId),
}));

// Golf Pick Selections (individual golfer choices for a pick session)
// pick ordering (1-4+) has NO functional significance — all slots are interchangeable
export const golfPickSelections = pgTable("golf_pick_selections", {
  id: serial("id").primaryKey(),
  pickId: integer("pick_id").notNull().references(() => golfPicks.id),
  playerId: integer("player_id").notNull().references(() => golfPlayers.id),
}, (table) => ({
  pickPlayerUnique: unique().on(table.pickId, table.playerId),
}));

// Golf Results (finishing positions per player per tournament)
export const golfResults = pgTable("golf_results", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => golfTournaments.id),
  playerId: integer("player_id").notNull().references(() => golfPlayers.id),
  finalPosition: integer("final_position"), // nullable — MC/WD/DQ have no position
  status: varchar("status").default("finished").notNull(), // 'finished' | 'mc' | 'wd' | 'dq'
  topTen: boolean("top_ten").default(false).notNull(), // auto-set: status='finished' AND finalPosition <= 10
}, (table) => ({
  tournamentPlayerResultUnique: unique().on(table.tournamentId, table.playerId),
}));

// Relationships
export const nflTeamsRelations = relations(nflTeams, ({ many }) => ({
  homeGames: many(nflGames, { relationName: "homeTeam" }),
  awayGames: many(nflGames, { relationName: "awayTeam" }),
  picks: many(userPicks),
}));

export const nflGamesRelations = relations(nflGames, ({ one, many }) => ({
  week: one(nflWeeks, {
    fields: [nflGames.weekId],
    references: [nflWeeks.id],
  }),
  homeTeam: one(nflTeams, {
    fields: [nflGames.homeTeamId],
    references: [nflTeams.id],
    relationName: "homeTeam",
  }),
  awayTeam: one(nflTeams, {
    fields: [nflGames.awayTeamId],
    references: [nflTeams.id],
    relationName: "awayTeam",
  }),
  picks: many(userPicks),
}));

export const nflWeeksRelations = relations(nflWeeks, ({ many }) => ({
  games: many(nflGames),
  picks: many(userPicks),
}));

export const userRelations = relations(users, ({ many }) => ({
  leaguesMember: many(leagueMembers),
  picks: many(userPicks),
}));

export const leagueRelations = relations(leagues, ({ many }) => ({
  members: many(leagueMembers),
  picks: many(userPicks),
}));

export const leagueMembersRelations = relations(leagueMembers, ({ one }) => ({
  league: one(leagues, {
    fields: [leagueMembers.leagueId],
    references: [leagues.id],
  }),
  user: one(users, {
    fields: [leagueMembers.userId],
    references: [users.id],
  }),
}));

export const userPicksRelations = relations(userPicks, ({ one }) => ({
  user: one(users, {
    fields: [userPicks.userId],
    references: [users.id],
  }),
  league: one(leagues, {
    fields: [userPicks.leagueId],
    references: [leagues.id],
  }),
  week: one(nflWeeks, {
    fields: [userPicks.weekId],
    references: [nflWeeks.id],
  }),
  game: one(nflGames, {
    fields: [userPicks.gameId],
    references: [nflGames.id],
  }),
  pickedTeam: one(nflTeams, {
    fields: [userPicks.pickedTeamId],
    references: [nflTeams.id],
  }),
}));

// Zod Schemas and Types
export type InsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Last pick info for leaderboard display
export type LastPickInfo = {
  weekNumber: number;
  pickedTeamName: string;
  pickedTeamAbbreviation: string;
  pickedTeamLogoUrl: string;
  opponentTeamName: string;
  spread: number;
  result: 'win' | 'loss' | 'pending';
  pointsEarned: number;
} | null;

// Extended User type for leaderboard with computed eligibility status
export type UserWithEligibility = User & {
  everyWeekEligible: boolean;
  lastPick?: LastPickInfo;
  nickname?: string | null; // Per-league display name from league_members
};

export type NFLTeam = typeof nflTeams.$inferSelect;
export type InsertNFLTeam = typeof nflTeams.$inferInsert;
export const insertNFLTeamSchema = createInsertSchema(nflTeams);

export type League = typeof leagues.$inferSelect;
export type InsertLeague = typeof leagues.$inferInsert;
export const insertLeagueSchema = createInsertSchema(leagues).omit({ 
  id: true,
  inviteCode: true,
  season: true,
  isArchived: true,
  archivedAt: true,
  createdAt: true, 
  updatedAt: true 
});

export type LeagueMember = typeof leagueMembers.$inferSelect;
export type InsertLeagueMember = typeof leagueMembers.$inferInsert;
export const insertLeagueMemberSchema = createInsertSchema(leagueMembers).omit({ 
  createdAt: true, 
  updatedAt: true 
});

export type NFLWeek = typeof nflWeeks.$inferSelect;
export type InsertNFLWeek = typeof nflWeeks.$inferInsert;
export const insertNFLWeekSchema = createInsertSchema(nflWeeks).omit({ 
  createdAt: true, 
  updatedAt: true 
});

export type NFLGame = typeof nflGames.$inferSelect;
export type InsertNFLGame = typeof nflGames.$inferInsert;
export const insertNFLGameSchema = createInsertSchema(nflGames).omit({ 
  createdAt: true, 
  updatedAt: true 
});

export type UserPick = typeof userPicks.$inferSelect;
export type InsertUserPick = typeof userPicks.$inferInsert;
export const insertUserPickSchema = createInsertSchema(userPicks).omit({ 
  createdAt: true, 
  updatedAt: true,
  won: true,
  pointsEarned: true
});

// Extended insert schema for picks with validation
export const userPickFormSchema = insertUserPickSchema.extend({
  gameId: z.number().int().positive(),
  pickedTeamId: z.number().int().positive(),
  leagueId: z.number().int().positive(),
  weekId: z.number().int().positive()
});

export type UserPickFormValues = z.infer<typeof userPickFormSchema>;

// Golf Types
export type GolfTournament = typeof golfTournaments.$inferSelect;
export type InsertGolfTournament = typeof golfTournaments.$inferInsert;
export const insertGolfTournamentSchema = createInsertSchema(golfTournaments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type GolfPlayer = typeof golfPlayers.$inferSelect;
export type InsertGolfPlayer = typeof golfPlayers.$inferInsert;
export const insertGolfPlayerSchema = createInsertSchema(golfPlayers).omit({
  id: true,
  createdAt: true,
});

export type GolfTournamentField = typeof golfTournamentField.$inferSelect;
export type InsertGolfTournamentField = typeof golfTournamentField.$inferInsert;

export type GolfPick = typeof golfPicks.$inferSelect;
export type InsertGolfPick = typeof golfPicks.$inferInsert;

export type GolfPickSelection = typeof golfPickSelections.$inferSelect;
export type InsertGolfPickSelection = typeof golfPickSelections.$inferInsert;

export type GolfResult = typeof golfResults.$inferSelect;
export type InsertGolfResult = typeof golfResults.$inferInsert;

// Golf leaderboard entry (computed for display)
export type GolfLeaderboardEntry = {
  userId: string;
  username: string;
  nickname: string | null;
  profileImageUrl: string | null;
  totalPoints: number;
  picks: {
    playerId: number;
    playerName: string;
    owgrAtLock: number | null;
    pointValue: number; // COALESCE(owgr_at_lock, 200)
    topTen: boolean;
    pointsEarned: number; // pointValue if topTen, else 0
    resultStatus: string | null; // 'finished' | 'mc' | 'wd' | 'dq' | null (no result yet)
    finalPosition: number | null;
  }[];
  tiebreakerOwgr: number | null; // highest OWGR number among all 4 picks (worst rank = biggest number)
  rank: number;
};

// Field entry with computed point value
export type GolfFieldEntry = {
  id: number;
  playerId: number;
  name: string;
  country: string | null;
  isAmateur: boolean;
  owgrAtLock: number | null;
  pointValue: number; // COALESCE(owgr_at_lock, 200)
};
