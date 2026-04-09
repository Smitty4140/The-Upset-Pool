import { useQuery } from "@tanstack/react-query";
import { User, NFLGame, NFLTeam } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, X, BarChart3, PieChart, Eye, Trophy, Target, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart as RechartsPieChart, Pie, Cell
} from 'recharts';

type UserPick = {
  id: number;
  userId: string;
  leagueId: number;
  weekId: number;
  gameId: number;
  pickedTeamId: number;
  isUnderdog: boolean;
  spreadAtTimeOfPick: number;
  won: boolean | null;
  pointsEarned: number | null;
  createdAt: string;
  updatedAt: string;
  user: User;
  pickedTeam: NFLTeam;
  game: NFLGame & { homeTeam: NFLTeam; awayTeam: NFLTeam; winningTeamId?: number };
};

type WeeklyPicksProps = {
  leagueId: number;
  weekId: number;
  isPicksLocked?: boolean;
};

export default function WeeklyPicks({ leagueId, weekId, isPicksLocked = false }: WeeklyPicksProps) {
  const { data: weeklyPicks, isLoading } = useQuery<UserPick[]>({
    queryKey: [`/api/league/${leagueId}/week/${weekId}/picks`],
  });

  const { data: leaderboard } = useQuery<User[]>({
    queryKey: [`/api/league/${leagueId}/leaderboard`],
  });

  // Function to calculate proper standings with ties
  const calculateStandings = (users: User[]) => {
    if (!users || users.length === 0) return [];
    
    // Sort users by points (descending)
    const sortedUsers = [...users].sort((a, b) => {
      const aPoints = parseFloat(a.totalPoints || '0');
      const bPoints = parseFloat(b.totalPoints || '0');
      return bPoints - aPoints;
    });
    
    // Calculate standings with proper tie handling
    const rankedUsers = [];
    let currentRank = 1;
    
    for (let i = 0; i < sortedUsers.length; i++) {
      const user = sortedUsers[i];
      const currentPoints = parseFloat(user.totalPoints || '0');
      
      // If this isn't the first user and points are different from previous user
      if (i > 0) {
        const previousPoints = parseFloat(sortedUsers[i - 1].totalPoints || '0');
        if (currentPoints !== previousPoints) {
          currentRank = i + 1; // Set rank to position + 1
        }
        // If points are the same, keep the same rank
      }
      
      rankedUsers.push({
        ...user,
        standing: currentRank
      });
    }
    
    return rankedUsers;
  };

  const rankedLeaderboard = leaderboard ? calculateStandings(leaderboard) : [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow-md p-4">
          <Skeleton className="h-8 w-64 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center space-x-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-6 w-24 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // If picks are not locked, show a message explaining why picks aren't visible
  if (!isPicksLocked) {
    return (
      <div className="space-y-6">
        <Card className="bg-white shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 px-6 py-4 border-b border-amber-200">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <Eye className="h-5 w-5 mr-2 text-amber-600" />
                Week {weekId} Picks
              </h3>
              <p className="text-sm text-amber-700 mt-1">Picks are hidden until the deadline passes</p>
            </div>
            
            <div className="px-6 py-12 text-center">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <Eye className="h-8 w-8 text-gray-400" />
              </div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">Picks Are Hidden</h4>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                Weekly picks will be revealed once the pick deadline has passed. This keeps the competition fair by preventing people from seeing others' selections before making their own.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-sm mx-auto">
                <p className="text-sm text-blue-800 font-medium">
                  Come back after 1:00 PM EST on Sunday to see everyone's picks!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get unique users who have picks
  const usersWithPicks = weeklyPicks?.reduce<Record<string, UserPick>>((acc, pick) => {
    acc[pick.userId] = pick;
    return acc;
  }, {}) || {};

  // Calculate weekly statistics
  const weeklyStats = {
    totalPoints: 0,
    totalWinningPicks: 0,
    totalPicks: weeklyPicks?.length || 0,
    uniqueGamesWon: new Set<number>(),
    winningPickSpreads: [] as number[],
    hasResults: false,
  };

  weeklyPicks?.forEach(pick => {
    if (pick.game.winningTeamId) {
      weeklyStats.hasResults = true;
      if (pick.won) {
        weeklyStats.totalWinningPicks++;
        weeklyStats.totalPoints += Number(pick.pointsEarned || 0);
        weeklyStats.uniqueGamesWon.add(pick.gameId);
        weeklyStats.winningPickSpreads.push(Math.abs(Number(pick.spreadAtTimeOfPick)));
      }
    }
  });

  const averageWinningPick = weeklyStats.winningPickSpreads.length > 0
    ? (weeklyStats.winningPickSpreads.reduce((a, b) => a + b, 0) / weeklyStats.winningPickSpreads.length).toFixed(1)
    : '0';

  // Prepare data for charts
  const picksByTeam = weeklyPicks?.reduce((acc: Record<string, number>, pick) => {
    const teamName = pick.pickedTeam.name;
    acc[teamName] = (acc[teamName] || 0) + 1;
    return acc;
  }, {}) || {};
  
  const teamPicksData = Object.entries(picksByTeam).map(([name, count]) => ({
    name,
    count
  }));
  
  // Get spread distribution data
  const spreadRanges = {
    'Less than 3': 0,
    '3 to 6': 0,
    'More than 6': 0
  };
  
  weeklyPicks?.forEach(pick => {
    const spread = Math.abs(Number(pick.spreadAtTimeOfPick));
    if (spread < 3) {
      spreadRanges['Less than 3']++;
    } else if (spread >= 3 && spread <= 6) {
      spreadRanges['3 to 6']++;
    } else {
      spreadRanges['More than 6']++;
    }
  });
  
  const spreadData = Object.entries(spreadRanges).map(([range, count]) => ({
    name: range,
    value: count
  }));

  // Prepare winning picks by team data for chart
  const winningPicksByTeam = weeklyPicks?.reduce((acc: Record<string, { wins: number; total: number; points: number; spread: number }>, pick) => {
    const teamName = pick.pickedTeam.name;
    if (!acc[teamName]) {
      acc[teamName] = { wins: 0, total: 0, points: 0, spread: 0 };
    }
    acc[teamName].total++;
    if (pick.won) {
      acc[teamName].wins++;
      acc[teamName].points += Number(pick.pointsEarned || 0);
      acc[teamName].spread = Math.abs(Number(pick.spreadAtTimeOfPick));
    }
    return acc;
  }, {}) || {};

  const winningTeamsData = Object.entries(winningPicksByTeam)
    .filter(([_, data]) => data.wins > 0)
    .map(([name, data]) => ({
      name: name.length > 12 ? name.substring(0, 10) + '...' : name,
      fullName: name,
      wins: data.wins,
      points: data.points,
      spread: data.spread
    }))
    .sort((a, b) => b.points - a.points);

  // Prepare winning spreads data for bar chart (sorted by spread value)
  const winningSpreadsData = Object.entries(winningPicksByTeam)
    .filter(([_, data]) => data.wins > 0)
    .map(([name, data]) => ({
      name: name.length > 12 ? name.substring(0, 10) + '...' : name,
      fullName: name,
      spread: data.spread
    }))
    .sort((a, b) => b.spread - a.spread);

  // Prepare game popularity data (picks per game, showing underdog team)
  // Group picks by game and count, then get all games (including those with 0 picks)
  const picksByGame = weeklyPicks?.reduce((acc: Record<number, { count: number; underdogName: string; spread: number }>, pick) => {
    const gameId = pick.gameId;
    if (!acc[gameId]) {
      acc[gameId] = { 
        count: 0, 
        underdogName: pick.pickedTeam.name,
        spread: Math.abs(Number(pick.spreadAtTimeOfPick))
      };
    }
    acc[gameId].count++;
    return acc;
  }, {}) || {};

  // Get all unique games from picks to find games with 0 picks
  // Track underdog result: 'won' | 'lost' | 'pending'
  const allGamesMap = new Map<number, { underdogName: string; spread: number; underdogResult: 'won' | 'lost' | 'pending' }>();
  weeklyPicks?.forEach(pick => {
    if (!allGamesMap.has(pick.gameId)) {
      // Determine underdog result based on game status
      let underdogResult: 'won' | 'lost' | 'pending' = 'pending';
      if (pick.game.winningTeamId) {
        // Game has a result - check if underdog (picked team) won
        underdogResult = pick.won ? 'won' : 'lost';
      }
      allGamesMap.set(pick.gameId, {
        underdogName: pick.pickedTeam.name,
        spread: Math.abs(Number(pick.spreadAtTimeOfPick)),
        underdogResult
      });
    }
  });

  const gamePopularityData = Array.from(allGamesMap.entries()).map(([gameId, gameInfo]) => ({
    name: gameInfo.underdogName.length > 12 ? gameInfo.underdogName.substring(0, 10) + '...' : gameInfo.underdogName,
    fullName: gameInfo.underdogName,
    picks: picksByGame[gameId]?.count || 0,
    spread: gameInfo.spread,
    underdogResult: gameInfo.underdogResult
  })).sort((a, b) => b.picks - a.picks);

  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
  
  return (
    <div className="space-y-6">
      {/* Weekly Stats Summary - Only show for past weeks with results */}
      {weeklyStats.hasResults && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Total Points</p>
                  <p className="text-2xl font-bold text-green-700">{weeklyStats.totalPoints.toFixed(1)}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-green-600" />
                </div>
              </div>
              <p className="text-xs text-green-600 mt-1">Earned by all poolers</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Avg Winning Spread</p>
                  <p className="text-2xl font-bold text-blue-700">+{averageWinningPick}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <p className="text-xs text-blue-600 mt-1">Points per winning pick</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-purple-600 uppercase tracking-wide">Winning Picks</p>
                  <p className="text-2xl font-bold text-purple-700">{weeklyStats.totalWinningPicks}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Target className="h-5 w-5 text-purple-600" />
                </div>
              </div>
              <p className="text-xs text-purple-600 mt-1">
                {weeklyStats.totalPicks > 0 
                  ? `${((weeklyStats.totalWinningPicks / weeklyStats.totalPicks) * 100).toFixed(0)}% success rate`
                  : 'No picks yet'
                }
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Unique Games Won</p>
                  <p className="text-2xl font-bold text-amber-700">{weeklyStats.uniqueGamesWon.size}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-amber-600" />
                </div>
              </div>
              <p className="text-xs text-amber-600 mt-1">Different upsets hit</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Section - Show at top when we have results */}
      {weeklyStats.hasResults && winningTeamsData.length > 0 && (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Winning Teams Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-base">
                <Trophy className="mr-2 h-5 w-5 text-green-600" />
                Points by Winning Team
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={winningTeamsData}
                    margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={50}
                      fontSize={11}
                    />
                    <YAxis fontSize={11} />
                    <Tooltip 
                      formatter={(value, name) => [
                        name === 'points' ? `${value} pts` : `${value} wins`,
                        name === 'points' ? 'Points' : 'Wins'
                      ]}
                      labelFormatter={(label) => {
                        const team = winningTeamsData.find(t => t.name === label);
                        return team?.fullName || label;
                      }}
                    />
                    <Bar dataKey="points" fill="#22c55e" name="points" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Winning Spreads Bar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-base">
                <BarChart3 className="mr-2 h-5 w-5 text-blue-600" />
                Winning Team Spreads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={winningSpreadsData}
                    margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={50}
                      fontSize={11}
                    />
                    <YAxis fontSize={11} label={{ value: 'Spread', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                    <Tooltip 
                      formatter={(value) => [`+${value}`, 'Spread']}
                      labelFormatter={(label) => {
                        const team = winningSpreadsData.find(t => t.name === label);
                        return team?.fullName || label;
                      }}
                    />
                    <Bar dataKey="spread" fill="#3b82f6" name="spread" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Game Popularity Chart - Full Width */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-base">
              <Users className="mr-2 h-5 w-5 text-purple-600" />
              Picks by Game (Underdog)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={gamePopularityData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45} 
                    textAnchor="end" 
                    height={70}
                    fontSize={10}
                    interval={0}
                  />
                  <YAxis fontSize={11} allowDecimals={false} label={{ value: 'Picks', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                  <Tooltip 
                    formatter={(value) => [`${value} pick${value === 1 ? '' : 's'}`, 'Picks']}
                    labelFormatter={(label) => {
                      const game = gamePopularityData.find(t => t.name === label);
                      return game ? `${game.fullName} (+${game.spread})` : label;
                    }}
                  />
                  <Bar dataKey="picks" name="picks" radius={[4, 4, 0, 0]}>
                    {gamePopularityData.map((entry, index) => {
                      let fillColor = '#9ca3af'; // gray for pending
                      if (entry.underdogResult === 'won') {
                        fillColor = '#22c55e'; // green for underdog won
                      } else if (entry.underdogResult === 'lost') {
                        fillColor = '#ef4444'; // red for underdog lost
                      }
                      return <Cell key={`cell-${index}`} fill={fillColor} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        </>
      )}

      {/* Picks Table */}
      <Card className="bg-white shadow-md">
        <CardContent className="p-0">
          <div className="bg-gradient-to-r from-primary/20 to-secondary/20 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Week {weekId} Picks</h3>
            <p className="text-sm text-gray-500">
              {weeklyStats.hasResults 
                ? `Results are in! ${weeklyStats.totalWinningPicks} winning picks this week.`
                : 'Picks are locked! See what everyone chose.'
              }
            </p>
          </div>

          {(() => {
            const getOrdinalSuffix = (num: number) => {
              const j = num % 10, k = num % 100;
              if (j === 1 && k !== 11) return `${num}st`;
              if (j === 2 && k !== 12) return `${num}nd`;
              if (j === 3 && k !== 13) return `${num}rd`;
              return `${num}th`;
            };

            const renderResultBadge = (userPick: UserPick | undefined) => {
              if (!userPick) return <span className="text-gray-400 text-xs">—</span>;
              if (!userPick.game.winningTeamId) {
                return (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    Pending
                  </span>
                );
              }
              return userPick.won ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <Check className="h-3 w-3 mr-1" />
                  +{userPick.pointsEarned}
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  <X className="h-3 w-3 mr-1" />
                  Loss
                </span>
              );
            };

            return (
              <>
                {/* ── Mobile card list (hidden on sm+) ── */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {rankedLeaderboard?.map((user) => {
                    const userPick = Object.values(usersWithPicks).find(p => p.userId === user.id);
                    return (
                      <div key={user.id} className="px-4 py-3 space-y-1.5">
                        {/* Line 1: standing + name | pts */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-semibold text-gray-400 w-7 flex-shrink-0">
                              {getOrdinalSuffix(user.standing)}
                            </span>
                            <span className="font-medium text-gray-900 text-sm truncate">
                              {(user as any).nickname ?? user.username}
                            </span>
                          </div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 flex-shrink-0 ml-2">
                            {user.totalPoints || 0} pts
                          </span>
                        </div>
                        {/* Line 2: team dot + name + spread | result badge */}
                        <div className="flex items-center justify-between pl-9">
                          {userPick ? (
                            <>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: userPick.pickedTeam.primaryColor || '#e5e7eb' }}
                                />
                                <span className="text-sm text-gray-700 truncate">
                                  {userPick.pickedTeam.name}
                                </span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 flex-shrink-0">
                                  {Number(userPick.spreadAtTimeOfPick) > 0 ? '+' : ''}{userPick.spreadAtTimeOfPick}
                                </span>
                              </div>
                              <div className="flex-shrink-0 ml-2">
                                {renderResultBadge(userPick)}
                              </div>
                            </>
                          ) : (
                            <span className="text-sm text-gray-400 italic">No pick</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Desktop table (hidden on mobile) ── */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Standing</th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Season Total</th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pick</th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opponent</th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spread</th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {rankedLeaderboard?.map((user) => {
                        const userPick = Object.values(usersWithPicks).find(p => p.userId === user.id);
                        return (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {getOrdinalSuffix(user.standing)}
                            </td>
                            <td className="px-3 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-700">
                                {user.totalPoints || 0} pts
                              </span>
                            </td>
                            <td className="px-3 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <Avatar className="h-8 w-8 mr-2 border border-gray-200">
                                  <AvatarImage src={user.profileImageUrl || ""} alt={user.username} />
                                  <AvatarFallback className="bg-primary/10 text-primary">
                                    {((user as any).nickname ?? user.username)?.[0].toUpperCase() || "?"}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="font-medium text-gray-900">{(user as any).nickname ?? user.username}</div>
                              </div>
                            </td>
                            <td className="px-3 py-4 whitespace-nowrap">
                              {userPick ? (
                                <div className="flex items-center">
                                  <div
                                    className="h-8 w-8 rounded-full flex items-center justify-center mr-2"
                                    style={{ backgroundColor: userPick.pickedTeam.primaryColor || '#e5e7eb' }}
                                  >
                                    <img src={userPick.pickedTeam.logoUrl || ''} alt={userPick.pickedTeam.name} className="h-6 w-6 object-contain" />
                                  </div>
                                  <span className="font-medium">{userPick.pickedTeam.name}</span>
                                </div>
                              ) : (
                                <span className="text-gray-500 italic">No pick</span>
                              )}
                            </td>
                            <td className="px-3 py-4 whitespace-nowrap">
                              {userPick ? (
                                <div className="flex items-center">
                                  <div
                                    className="h-7 w-7 rounded-full flex items-center justify-center mr-2"
                                    style={{ backgroundColor: (userPick.pickedTeamId === userPick.game.homeTeamId ? userPick.game.awayTeam.primaryColor : userPick.game.homeTeam.primaryColor) || '#e5e7eb' }}
                                  >
                                    <img
                                      src={userPick.pickedTeamId === userPick.game.homeTeamId ? userPick.game.awayTeam.logoUrl : userPick.game.homeTeam.logoUrl}
                                      alt={userPick.pickedTeamId === userPick.game.homeTeamId ? userPick.game.awayTeam.name : userPick.game.homeTeam.name}
                                      className="h-5 w-5 object-contain"
                                    />
                                  </div>
                                  <span className="text-sm">
                                    {userPick.pickedTeamId === userPick.game.homeTeamId ? userPick.game.awayTeam.name : userPick.game.homeTeam.name}
                                  </span>
                                </div>
                              ) : (
                                <span>-</span>
                              )}
                            </td>
                            <td className="px-3 py-4 whitespace-nowrap">
                              {userPick ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {Number(userPick.spreadAtTimeOfPick) > 0 ? '+' : ''}{userPick.spreadAtTimeOfPick}
                                </span>
                              ) : (
                                <span>-</span>
                              )}
                            </td>
                            <td className="px-3 py-4 whitespace-nowrap">
                              {userPick ? (
                                userPick.game.winningTeamId ? (
                                  userPick.won ? (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      <Check className="h-3 w-3 mr-1" />
                                      Winner (+{userPick.pointsEarned})
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                      <X className="h-3 w-3 mr-1" />
                                      Loser
                                    </span>
                                  )
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                    Result Pending
                                  </span>
                                )
                              ) : (
                                <span>-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* Pre-Results Charts - Show only before games are decided */}
      {!weeklyStats.hasResults && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Most Popular Picks Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="mr-2 h-5 w-5" />
                Most Popular Picks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={teamPicksData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={60}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => [`${value} picks`, 'Count']} 
                    />
                    <Bar dataKey="count" fill="#8884d8" name="Number of Picks">
                      {teamPicksData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Spread Distribution Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <PieChart className="mr-2 h-5 w-5" />
                Spread Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={spreadData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {spreadData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} picks`, 'Count']} />
                    <Legend />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}