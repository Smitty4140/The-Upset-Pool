import { useQuery } from "@tanstack/react-query";
import { UserWithEligibility } from "@shared/schema";
import { LastPickInfo } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Medal, Calendar, Check, X, ChevronDown, ChevronUp, Clock } from "lucide-react";
import React, { useState, useEffect } from "react";

interface UserPick {
  id: number;
  weekId: number;
  weekNumber: number;
  pickedTeamName: string;
  pickedTeamAbbreviation: string;
  pickedTeamLogoUrl: string;
  spread: number;
  result: string | null;
  pointsEarned: number | null;
  opponentTeamName: string;
}

interface LeaderboardUser extends UserWithEligibility {
  lastPick?: LastPickInfo;
}

type LeaderboardProps = {
  leagueId: number;
};

export default function Leaderboard({ leagueId }: LeaderboardProps) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userPicksCache, setUserPicksCache] = useState<Record<string, UserPick[]>>({});
  
  const { data: leaderboard, isLoading } = useQuery<LeaderboardUser[]>({
    queryKey: [`/api/league/${leagueId}/leaderboard`],
  });

  // Lazy load user picks when accordion is expanded
  const { data: userPicks, isLoading: isLoadingPicks } = useQuery<UserPick[]>({
    queryKey: [`/api/league/${leagueId}/user/${expandedUserId}/picks`],
    enabled: !!expandedUserId && !userPicksCache[expandedUserId]
  });

  // Cache fetched picks
  useEffect(() => {
    if (userPicks && expandedUserId && !userPicksCache[expandedUserId]) {
      setUserPicksCache(prev => ({
        ...prev,
        [expandedUserId]: userPicks
      }));
    }
  }, [userPicks, expandedUserId, userPicksCache]);

  // Toggle accordion for a user
  const handleToggleAccordion = (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
    } else {
      setExpandedUserId(userId);
    }
  };

  // Get picks for currently expanded user
  const currentUserPicks = expandedUserId ? (userPicksCache[expandedUserId] || userPicks || []) : [];

  // Function to calculate proper rankings with ties
  const calculateRankings = (users: LeaderboardUser[]) => {
    if (!users || users.length === 0) return [];
    
    // Sort users by points (descending)
    const sortedUsers = [...users].sort((a, b) => {
      const aPoints = Number(a.totalPoints) || 0;
      const bPoints = Number(b.totalPoints) || 0;
      return bPoints - aPoints;
    });
    
    // Calculate rankings with proper tie handling
    const rankedUsers: (LeaderboardUser & { rank: number })[] = [];
    let currentRank = 1;
    
    for (let i = 0; i < sortedUsers.length; i++) {
      const user = sortedUsers[i];
      const currentPoints = Number(user.totalPoints) || 0;
      
      // If this isn't the first user and points are different from previous user
      if (i > 0) {
        const previousPoints = Number(sortedUsers[i - 1].totalPoints) || 0;
        if (currentPoints !== previousPoints) {
          currentRank = i + 1; // Set rank to position + 1
        }
        // If points are the same, keep the same rank
      }
      
      rankedUsers.push({
        ...user,
        rank: currentRank
      });
    }
    
    return rankedUsers;
  };

  const rankedLeaderboard = leaderboard ? calculateRankings(leaderboard) : [];

  const formatDate = () => {
    const now = new Date();
    return now.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
        <div className="bg-gradient-to-r from-primary/20 to-secondary/20 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <Trophy className="h-5 w-5 text-accent mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Leaderboard</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">Loading...</p>
        </div>
        <div className="px-6 py-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center space-x-4 py-3">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-5 w-12" />
              <div className="flex items-center flex-1">
                <Skeleton className="h-8 w-8 rounded-full mr-2" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
      <div className="bg-gradient-to-r from-primary/20 to-secondary/20 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          <Trophy className="h-5 w-5 text-yellow-500 mr-2" />
          <h3 className="text-lg font-medium text-gray-900">Leaderboard</h3>
        </div>
        <div className="flex items-center text-sm text-gray-500 mt-1">
          <Calendar className="h-3.5 w-3.5 mr-1" />
          <span>As of {formatDate()}</span>
        </div>
      </div>
      <div className="px-2 sm:px-4 py-3">
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-2 sm:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Place</th>
              <th scope="col" className="px-2 sm:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Score</th>
              <th scope="col" className="px-2 sm:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Pooler</th>
              <th scope="col" className="hidden sm:table-cell px-2 sm:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Last Pick</th>
              <th scope="col" className="px-2 sm:px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Eligible</th>
              <th scope="col" className="px-2 sm:px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-8 sm:w-12"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rankedLeaderboard && rankedLeaderboard.length > 0 ? (
              rankedLeaderboard.map((user) => (
                <React.Fragment key={user.id}>
                  <tr 
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleToggleAccordion(user.id)}
                    data-testid={`leaderboard-row-${user.id}`}
                  >
                    <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center">
                        {user.rank === 1 ? (
                          <Medal className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
                        ) : user.rank === 2 ? (
                          <Medal className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                        ) : user.rank === 3 ? (
                          <Medal className="h-4 w-4 sm:h-5 sm:w-5 text-amber-700" />
                        ) : (
                          <span className="font-medium text-gray-700 text-sm">{user.rank}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap">
                      <div className="text-xs sm:text-sm font-bold bg-blue-50 text-blue-700 px-2 sm:px-3 py-1 rounded-full inline-block">
                        {user.totalPoints || "0"}
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex items-center">
                        <Avatar className="h-6 w-6 sm:h-7 sm:w-7 mr-1.5 sm:mr-2 border border-gray-200 flex-shrink-0">
                          <AvatarImage src={user.profileImageUrl ?? ""} alt={user.username ?? ""} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {user.username?.[0].toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-xs sm:text-sm truncate max-w-[80px] sm:max-w-none">{user.username}</span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm" data-testid={`last-pick-${user.id}`}>
                      {user.lastPick ? (
                        <div 
                          className={`inline-flex items-center space-x-1.5 px-2 py-1 rounded-md border ${
                            user.lastPick.result === 'win' 
                              ? 'bg-green-50 border-green-200' 
                              : user.lastPick.result === 'loss' 
                                ? 'bg-red-50 border-red-200' 
                                : 'bg-gray-50 border-gray-200'
                          }`}
                          title={`${user.lastPick.pickedTeamName} vs ${user.lastPick.opponentTeamName} (Week ${user.lastPick.weekNumber})`}
                        >
                          <img 
                            src={user.lastPick.pickedTeamLogoUrl} 
                            alt={user.lastPick.pickedTeamAbbreviation}
                            className="h-5 w-5 object-contain"
                          />
                          <span className={`text-xs font-bold ${
                            user.lastPick.result === 'win' 
                              ? 'text-green-700' 
                              : user.lastPick.result === 'loss' 
                                ? 'text-red-700' 
                                : 'text-gray-600'
                          }`}>
                            +{user.lastPick.spread}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-center">
                      {user.everyWeekEligible ? (
                        <div data-testid={`eligible-status-${user.id}`} className="flex items-center justify-center text-green-600">
                          <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                        </div>
                      ) : (
                        <div data-testid={`eligible-status-${user.id}`} className="flex items-center justify-center text-red-600">
                          <X className="h-4 w-4 sm:h-5 sm:w-5" />
                        </div>
                      )}
                    </td>
                    <td className="px-1 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-center">
                      {expandedUserId === user.id ? (
                        <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 mx-auto" />
                      ) : (
                        <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 mx-auto" />
                      )}
                    </td>
                  </tr>
                  {expandedUserId === user.id && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 bg-gray-50">
                        <div className="animate-in slide-in-from-top-2 duration-200">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                            <Calendar className="h-4 w-4 mr-2" />
                            Weekly Picks for {user.username}
                          </h4>
                          {isLoadingPicks && !userPicksCache[user.id] ? (
                            <div className="space-y-2">
                              {Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                              ))}
                            </div>
                          ) : currentUserPicks.length > 0 ? (
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {currentUserPicks.map((pick) => (
                                <div 
                                  key={pick.id} 
                                  className="flex items-center bg-white p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors max-w-2xl"
                                  data-testid={`pick-week-${pick.weekNumber}`}
                                >
                                  <div className="flex items-center space-x-4">
                                    <div className="text-sm font-medium text-gray-500 min-w-[60px]">
                                      Week {pick.weekNumber}
                                    </div>
                                    <img 
                                      src={pick.pickedTeamLogoUrl} 
                                      alt={pick.pickedTeamName}
                                      className="h-8 w-8 object-contain"
                                    />
                                    <div className="flex flex-col">
                                      <div className="font-semibold text-gray-900">
                                        {pick.pickedTeamName}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        vs {pick.opponentTeamName} (+{Math.abs(pick.spread)})
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-3 ml-6">
                                    {pick.result === 'win' ? (
                                      <div className="flex items-center text-green-600">
                                        <Check className="h-5 w-5 mr-1" />
                                        <span className="font-semibold text-sm">+{pick.pointsEarned} pts</span>
                                      </div>
                                    ) : pick.result === 'loss' ? (
                                      <div className="flex items-center text-red-600">
                                        <X className="h-5 w-5 mr-1" />
                                        <span className="font-semibold text-sm">0 pts</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center text-gray-400">
                                        <Clock className="h-5 w-5 mr-1" />
                                        <span className="text-sm">Pending</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-6 text-gray-500">
                              <p className="text-sm">No picks available yet</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center">
                  <div className="flex flex-col items-center text-gray-500">
                    <Trophy className="h-10 w-10 text-gray-300 mb-2" />
                    <p className="font-medium">No entries yet</p>
                    <p className="text-xs mt-1">Make your pick to join the leaderboard!</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
