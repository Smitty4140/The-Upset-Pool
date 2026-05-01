// Type definitions for frontend components
// These match the types defined in shared/schema.ts

export interface User {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  totalPoints: number;
  createdAt: string;
  updatedAt: string;
  nickname?: string | null; // Per-league display name (present on leaderboard/picks responses)
}

export interface NFLTeam {
  id: number;
  name: string;
  abbreviation: string;
  logoUrl: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  city?: string; // Optional city field
}

export interface League {
  id: number;
  name: string;
  description: string | null;
  inviteCode: string;
  season: number | null;
  sportType: string; // 'nfl' | 'golf'
  golfTournamentId: number | null;
  isArchived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GolfTournament {
  id: number;
  name: string;
  location: string | null;
  season: number;
  startsAt: string | null;
  picksLockAt: string;
  status: string; // 'upcoming' | 'active' | 'completed'
  picksRequired: number;
  createdAt: string;
  updatedAt: string;
}

export interface GolfPlayer {
  id: number;
  name: string;
  country: string | null;
  isAmateur: boolean;
  createdAt: string;
}

export interface GolfFieldEntry {
  id: number;
  playerId: number;
  name: string;
  country: string | null;
  isAmateur: boolean;
  photoUrl: string | null;
  owgrAtLock: number | null;
  odds: number | null; // e.g. 2000 = +2000 odds
  pointValue: number; // positive odds value, or 0 if odds <= 0 or null
}

export interface GolfPickSession {
  id: number;
  userId: string;
  leagueId: number;
  tournamentId: number;
  createdAt: string;
  updatedAt: string;
  selections: { playerId: number; playerName: string }[];
}

export interface GolfLeaderboardEntry {
  userId: string;
  username: string;
  nickname: string | null;
  profileImageUrl: string | null;
  totalPoints: number;
  picks: {
    playerId: number;
    playerName: string;
    owgrAtLock: number | null;
    pointValue: number;
    topTen: boolean;
    pointsEarned: number;
    resultStatus: string | null;
    finalPosition: number | null;
  }[];
  tiebreakerOdds: number | null;
  rank: number;
}

export interface LeagueMember {
  id: number;
  leagueId: number;
  userId: string;
  isAdmin: boolean;
  isActive: boolean;
  nickname: string | null;
  createdAt: string;
  updatedAt: string;
  league?: League;
  user?: User;
}

export interface NFLWeek {
  id: number;
  weekNumber: number;
  season: number;
  startDate: string;
  endDate: string;
  active: boolean;
  picksLockAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface NFLGame {
  id: string;  // Changed to string to match API response format
  weekId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamScore: number | null;
  awayTeamScore: number | null;
  spread: number;
  homeTeamRecord: string | null;
  awayTeamRecord: string | null;
  gameTime: string;
  completed: boolean;
  winningTeamId: number | null; // The team that won the game
  createdAt: string;
  updatedAt: string;
  homeTeam: NFLTeam;
  awayTeam: NFLTeam;
}

export interface UserPick {
  id: number;
  userId: string;
  leagueId: number;
  weekId: number;
  gameId: string; // Changed to string to match API response format
  pickedTeamId: number;
  isUnderdog: boolean;
  spreadAtTimeOfPick: number;
  won: boolean | null;
  pointsEarned: number | null;
  createdAt: string;
  updatedAt: string;
  pickedTeam?: NFLTeam;
  game?: NFLGame;
  user?: User;
}

export interface UserPickFormValues {
  gameId: string; // Changed to string to match API response format
  pickedTeamId: number;
  leagueId: number;
  weekId: number;
}

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
