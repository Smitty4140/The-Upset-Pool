import { useQuery } from "@tanstack/react-query";
import { User, NFLGame, NFLTeam } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, X, BarChart3, PieChart } from "lucide-react";
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
};

export default function WeeklyPicks({ leagueId, weekId }: WeeklyPicksProps) {
  const { data: weeklyPicks, isLoading } = useQuery<UserPick[]>({
    queryKey: [`/api/league/${leagueId}/week/${weekId}/picks`],
  });

  const { data: leaderboard } = useQuery<User[]>({
    queryKey: [`/api/league/${leagueId}/leaderboard`],
  });

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

  // Get unique users who have picks
  const usersWithPicks = weeklyPicks?.reduce<Record<string, UserPick>>((acc, pick) => {
    acc[pick.userId] = pick;
    return acc;
  }, {}) || {};

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
  
  // Count underdog vs favorite picks
  const pickTypeData = [
    { name: 'Underdog', value: 0 },
    { name: 'Favorite', value: 0 }
  ];
  
  weeklyPicks?.forEach(pick => {
    if (pick.isUnderdog) {
      pickTypeData[0].value++;
    } else {
      pickTypeData[1].value++;
    }
  });
  
  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
  
  return (
    <div className="space-y-6">
      <Card className="bg-white shadow-md">
        <CardContent className="p-0">
          <div className="bg-gradient-to-r from-primary/20 to-secondary/20 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Week {weekId} Picks</h3>
            <p className="text-sm text-gray-500">Picks are locked! See what everyone chose.</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pick
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Opponent
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Spread
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Season Total
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaderboard?.map((user) => {
                  const userPick = Object.values(usersWithPicks).find(
                    (pick) => pick.userId === user.id
                  );
                  
                  return (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Avatar className="h-8 w-8 mr-2 border border-gray-200">
                            <AvatarImage src={user.profileImageUrl || ""} alt={user.username} />
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {user.username?.[0].toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-gray-900">{user.username}</div>
                            <div className="text-xs text-gray-500">{user.totalPoints || 0} pts total</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {userPick ? (
                          <div className="flex items-center">
                            <div 
                              className="h-8 w-8 rounded-full flex items-center justify-center mr-2" 
                              style={{ backgroundColor: userPick.pickedTeam.primaryColor || '#e5e7eb' }}
                            >
                              <img
                                src={userPick.pickedTeam.logoUrl || ''}
                                alt={userPick.pickedTeam.name}
                                className="h-6 w-6 object-contain"
                              />
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
                              style={{ 
                                backgroundColor: 
                                  (userPick.pickedTeamId === userPick.game.homeTeamId 
                                    ? userPick.game.awayTeam.primaryColor 
                                    : userPick.game.homeTeam.primaryColor) || '#e5e7eb' 
                              }}
                            >
                              <img
                                src={
                                  userPick.pickedTeamId === userPick.game.homeTeamId 
                                    ? userPick.game.awayTeam.logoUrl 
                                    : userPick.game.homeTeam.logoUrl
                                }
                                alt={
                                  userPick.pickedTeamId === userPick.game.homeTeamId 
                                    ? userPick.game.awayTeam.name 
                                    : userPick.game.homeTeam.name
                                }
                                className="h-5 w-5 object-contain"
                              />
                            </div>
                            <span className="text-sm">
                              {
                                userPick.pickedTeamId === userPick.game.homeTeamId 
                                  ? userPick.game.awayTeam.name 
                                  : userPick.game.homeTeam.name
                              }
                            </span>
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {userPick ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {userPick.spreadAtTimeOfPick > 0 ? '+' : ''}{userPick.spreadAtTimeOfPick}
                          </span>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800">
                            {user.totalPoints || 0} pts
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {userPick ? (
                          userPick.game.winningTeamId ? (
                            // Game has a result
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
                            // No result yet
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
        </CardContent>
      </Card>

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

        {/* Underdog vs Favorite Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <PieChart className="mr-2 h-5 w-5" />
              Underdog vs Favorite Picks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={pickTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    <Cell fill="#82ca9d" />
                    <Cell fill="#8884d8" />
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} picks`, 'Count']} />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}