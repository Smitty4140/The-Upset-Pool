import { useQuery } from "@tanstack/react-query";
import { User, NFLGame, NFLTeam } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type UserPick = {
  id: number;
  userId: string;
  leagueId: number;
  weekId: number;
  gameId: number;
  teamId: number;
  isUnderdog: boolean;
  spreadAtTimeOfPick: number;
  createdAt: string;
  updatedAt: string;
  user: User;
  pickedTeam: NFLTeam;
  game: NFLGame & { homeTeam: NFLTeam; awayTeam: NFLTeam };
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
                    Spread
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
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {userPick.spreadAtTimeOfPick > 0 ? '+' : ''}{userPick.spreadAtTimeOfPick}
                          </span>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {userPick ? (
                          userPick.game.completed ? (
                            // Check if user's picked team won (simplified for now since winnerId isn't in the schema)
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Result Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Pending
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
    </div>
  );
}