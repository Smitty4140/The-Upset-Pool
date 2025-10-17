import { useQuery } from "@tanstack/react-query";
import { User, League } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Medal, Calendar, Award, Users, ChevronDown, ChevronUp, Check, X, Clock } from "lucide-react";
import { Helmet } from "react-helmet";
import React, { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface UserPick {
  id: number;
  weekId: number;
  weekNumber: number;
  pickedTeamName: string;
  pickedTeamAbbreviation: string;
  spread: number;
  result: string | null;
  pointsEarned: number | null;
  opponentTeamName: string;
}

export default function LeaderboardPage() {
  const [selectedLeagueId, setSelectedLeagueId] = useState<number>(1);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userPicksCache, setUserPicksCache] = useState<Record<string, UserPick[]>>({});
  
  // Get all leagues for the selector
  const { data: leagues, isLoading: isLoadingLeagues } = useQuery<League[]>({
    queryKey: ["/api/leagues"],
  });
  
  // Get leaderboard data for the selected league
  const { data: leaderboard, isLoading: isLoadingLeaderboard } = useQuery<User[]>({
    queryKey: [`/api/league/${selectedLeagueId}/leaderboard`],
    enabled: !!selectedLeagueId
  });

  // Lazy load user picks when accordion is expanded
  const { data: userPicks, isLoading: isLoadingPicks } = useQuery<UserPick[]>({
    queryKey: [`/api/league/${selectedLeagueId}/user/${expandedUserId}/picks`],
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
      // Close accordion
      setExpandedUserId(null);
    } else {
      // Open accordion
      setExpandedUserId(userId);
    }
  };

  // Get picks for currently expanded user
  const currentUserPicks = expandedUserId ? (userPicksCache[expandedUserId] || userPicks || []) : [];

  // Function to calculate proper rankings with ties
  const calculateRankings = (users: User[]) => {
    if (!users || users.length === 0) return [];
    
    // Sort users by points (descending)
    const sortedUsers = [...users].sort((a, b) => {
      const aPoints = parseFloat(a.totalPoints || '0');
      const bPoints = parseFloat(b.totalPoints || '0');
      return bPoints - aPoints;
    });
    
    // Calculate rankings with proper tie handling
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

  return (
    <div className="container mx-auto px-4 py-8">
      <Helmet>
        <title>Leaderboard | NFL Upset Pool</title>
        <meta name="description" content="View the current standings and rankings in our NFL upset pool competition." />
      </Helmet>
      
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <Trophy className="h-7 w-7 text-yellow-500 mr-3" />
          <h1 className="text-3xl font-bold text-gray-900">Leaderboard</h1>
        </div>
        <p className="text-gray-600 max-w-2xl">
          Track who's leading the pack in picking NFL underdogs. Points are awarded based on the spread when your underdog team wins outright.
        </p>
      </div>
      
      {/* League Selector */}
      <div className="mb-8">
        <div className="flex items-center mb-2">
          <Users className="h-5 w-5 text-primary mr-2" />
          <h2 className="text-lg font-medium">Select League</h2>
        </div>
        {isLoadingLeagues ? (
          <Skeleton className="h-10 w-64" />
        ) : (
          <Select
            value={selectedLeagueId.toString()}
            onValueChange={(value) => setSelectedLeagueId(Number(value))}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a league" />
            </SelectTrigger>
            <SelectContent>
              {leagues?.map((league) => (
                <SelectItem key={league.id} value={league.id.toString()}>
                  {league.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      
      {/* Leaderboard Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
        <div className="bg-gradient-to-r from-primary/20 to-secondary/20 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <Award className="h-5 w-5 text-yellow-500 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Season Standings</h3>
          </div>
          <div className="flex items-center text-sm text-gray-500 mt-1">
            <Calendar className="h-3.5 w-3.5 mr-1" />
            <span>As of {formatDate()}</span>
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="overflow-x-auto">
            {isLoadingLeaderboard ? (
              <div className="p-4">
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
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pooler</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Every Week Eligible</th>
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
                        <td className="px-3 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center">
                            {user.rank === 1 ? (
                              <Medal className="h-5 w-5 text-yellow-500 mr-1" />
                            ) : user.rank === 2 ? (
                              <Medal className="h-5 w-5 text-gray-400 mr-1" />
                            ) : user.rank === 3 ? (
                              <Medal className="h-5 w-5 text-amber-700 mr-1" />
                            ) : (
                              <span className="font-medium text-gray-700 mx-1">{user.rank}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap">
                          <div className="text-sm font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full inline-block">
                            {user.totalPoints || "0"} pts
                          </div>
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-700">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <Avatar className="h-7 w-7 mr-2 border border-gray-200">
                                <AvatarImage src={user.profileImageUrl || ""} alt={user.username} />
                                <AvatarFallback className="bg-primary/10 text-primary">
                                  {user.username?.[0]?.toUpperCase() || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{user.username}</span>
                            </div>
                            {expandedUserId === user.id ? (
                              <ChevronUp className="h-5 w-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-gray-400" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-center">
                          {user.everyWeekEligible ? (
                            <div className="flex items-center justify-center text-green-600" data-testid={`eligible-yes-${user.id}`}>
                              <Check className="h-5 w-5" />
                              <span className="ml-1 font-medium">Yes</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center text-red-600" data-testid={`eligible-no-${user.id}`}>
                              <X className="h-5 w-5" />
                              <span className="ml-1 font-medium">No</span>
                            </div>
                          )}
                        </td>
                      </tr>
                      {expandedUserId === user.id && (
                        <tr key={`${user.id}-accordion`}>
                          <td colSpan={4} className="px-3 py-4 bg-gray-50">
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
                                      className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                                      data-testid={`pick-week-${pick.weekNumber}`}
                                    >
                                      <div className="flex items-center space-x-4">
                                        <div className="text-sm font-medium text-gray-500 min-w-[60px]">
                                          Week {pick.weekNumber}
                                        </div>
                                        <div className="flex flex-col">
                                          <div className="font-semibold text-gray-900">
                                            {pick.pickedTeamName}
                                          </div>
                                          <div className="text-xs text-gray-500">
                                            vs {pick.opponentTeamName} ({pick.spread > 0 ? '+' : ''}{pick.spread})
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center space-x-3">
                                        {pick.result === 'win' ? (
                                          <>
                                            <div className="flex items-center text-green-600">
                                              <Check className="h-5 w-5 mr-1" />
                                              <span className="font-semibold text-sm">+{pick.pointsEarned} pts</span>
                                            </div>
                                          </>
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
                    <td colSpan={3} className="px-3 py-8 text-center">
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}