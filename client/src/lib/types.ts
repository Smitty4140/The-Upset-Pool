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
  createdAt: string;
  updatedAt: string;
}

export interface LeagueMember {
  id: number;
  leagueId: number;
  userId: string;
  isAdmin: boolean;
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
