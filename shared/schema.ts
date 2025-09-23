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
import { relations } from "drizzle-orm";

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

// NFL Leagues table
export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  inviteCode: varchar("invite_code", { length: 6 }).notNull().unique(),
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
  hasPaid: boolean("has_paid").default(false), // Whether the member has paid their league fee
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
  };
});

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

// Extended User type for leaderboard with computed eligibility status
export type UserWithEligibility = User & {
  everyWeekEligible: boolean;
};

export type NFLTeam = typeof nflTeams.$inferSelect;
export type InsertNFLTeam = typeof nflTeams.$inferInsert;
export const insertNFLTeamSchema = createInsertSchema(nflTeams);

export type League = typeof leagues.$inferSelect;
export type InsertLeague = typeof leagues.$inferInsert;
export const insertLeagueSchema = createInsertSchema(leagues).omit({ 
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
