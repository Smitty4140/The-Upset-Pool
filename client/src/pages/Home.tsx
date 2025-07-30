import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import LeagueHeader from "@/components/LeagueHeader";
import AdminControls from "@/components/AdminControls";
import ContentTabs from "@/components/ContentTabs";
import NFLGameCard from "@/components/NFLGameCard";
import WeekSelector from "@/components/WeekSelector";
import Leaderboard from "@/components/Leaderboard";
import WeeklyPicks from "@/components/WeeklyPicks";
import NFLGamesGrid from "@/components/NFLGamesGrid";
import GameResults from "@/components/GameResults";
import { NFLWeek, NFLGame, UserPick, User } from "@/lib/types";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, MessageSquare, Trophy, Medal, Calendar, Loader2, Check, Lock, Unlock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Helmet } from "react-helmet";
import { Link } from "wouter";

type Tab = "spreads" | "messageboard" | "leaderboard" | "weeklypicks" | "results" | "admin";
type SortOption = "spread" | "homeUnderdog" | "gameTime";

export default function Home() {
  const { user, isAuthenticated, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("spreads");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("gameTime");
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Default league ID - in a real app we would fetch the user's leagues
  const leagueId = 1;

  // Get all NFL weeks
  const { data: allWeeks, isLoading: isLoadingAllWeeks } = useQuery<NFLWeek[]>({
    queryKey: ["/api/nfl-weeks"],
  });

  // Get the current NFL week
  const { data: currentWeek, isLoading: isLoadingWeek } = useQuery<NFLWeek>({
    queryKey: ["/api/nfl-weeks/current"],
  });
  
  // Set selected week when current week loads
  useEffect(() => {
    if (currentWeek?.id && !selectedWeekId) {
      setSelectedWeekId(currentWeek.id);
    }
  }, [currentWeek, selectedWeekId]);

  // The active week is the selected week (for viewing) or current week (fallback)
  const activeWeekId = selectedWeekId || currentWeek?.id;
  
  // The week used for picks is always the current week (picks only allowed for current week)
  const pickableWeekId = currentWeek?.id;

  // Get NFL games from the database for the active week (selected or current)
  const { data: databaseGames, isLoading: isLoadingDatabaseGames } = useQuery<NFLGame[]>({
    queryKey: [`/api/nfl-games/week/${activeWeekId}`],
    enabled: !!activeWeekId,
  });
  
  // Set the games from the database
  const allGames = databaseGames;
  
  // Filter games by the selected week and sort by date
  const games = useMemo(() => {
    if (!allGames) return [];
    
    return allGames
      .filter(game => activeWeekId ? game.weekId === activeWeekId : true)
      .sort((a, b) => new Date(a.gameTime).getTime() - new Date(b.gameTime).getTime());
  }, [allGames, activeWeekId]);
  
  const isLoadingGames = isLoadingDatabaseGames;

  // Get the user's pick for the current week (picks only for current week)
  const { data: userPick, isLoading: isLoadingPick, refetch: refetchUserPick } = useQuery<UserPick | null>({
    queryKey: ["/api/user/pick", { weekId: pickableWeekId, leagueId }],
    enabled: !!pickableWeekId && isAuthenticated,
  });
  
  // Get the leaderboard data
  const { data: leaderboard, isLoading: isLoadingLeaderboard } = useQuery<User[]>({
    queryKey: [`/api/league/${leagueId}/leaderboard`],
  });

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

  // Get league members to check admin status
  const { data: leagueMembers, isLoading: isLoadingMembers } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/members`],
  });

  // Check if user is an admin for this league
  const isAdmin = user && leagueMembers && Array.isArray(leagueMembers) && 
    leagueMembers.some((member: any) => 
      member.userId === user.id && member.isAdmin
    );

  // Mutation for submitting a pick
  const { mutate: submitPick, isPending: isSubmittingPick } = useMutation({
    mutationFn: async (data: { gameId: string; pickedTeamId: number; leagueId: number; weekId: number }) => {
      return apiRequest("POST", "/api/user/pick", data);
    },
    onSuccess: (data) => {
      // Invalidate all related queries for immediate UI updates
      queryClient.invalidateQueries({ queryKey: ["/api/user/pick"] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/week/${activeWeekId}/picks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/leaderboard`] });
      
      // First fetch the updated pick to ensure we have the latest data
      refetchUserPick().then(() => {
        // Find the selected team info for better UI feedback
        const selectedGame = games?.find(game => game.id === selectedGameId);
        const selectedTeam = selectedGame ? 
          (selectedGame.homeTeamId === selectedTeamId ? selectedGame.homeTeam : selectedGame.awayTeam) : 
          null;

        toast({
          title: "Pick Submitted!",
          description: selectedTeam ? 
            `You've selected ${selectedTeam.name} as your pick for this week` : 
            "Your pick has been saved",
          variant: "default",
        });
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit pick",
        variant: "destructive",
      });
    },
  });

  // Handle team selection
  const handleTeamSelection = (gameId: string, teamId: number) => {
    setSelectedGameId(gameId);
    setSelectedTeamId(teamId);
  };

  // Handle pick submission
  const handleSubmitPick = () => {
    if (!selectedGameId || !selectedTeamId || !pickableWeekId) {
      toast({
        title: "Error",
        description: "Please select a team",
        variant: "destructive",
      });
      return;
    }

    // Get the selected team's information
    const selectedGame = games?.find(game => game.id === selectedGameId);
    const isHomeTeamSelected = selectedGame?.homeTeam.id === selectedTeamId;
    const selectedTeamInfo = isHomeTeamSelected ? selectedGame?.homeTeam : selectedGame?.awayTeam;
    
    submitPick({
      gameId: selectedGameId,
      pickedTeamId: selectedTeamId,
      leagueId,
      weekId: pickableWeekId,
    });
    
    // Show a toast with the selected team to make it obvious
    if (selectedTeamInfo) {
      toast({
        title: "Pick Submitted",
        description: `You've selected ${selectedTeamInfo.name} as your underdog pick!`,
        variant: "default",
      });
    }
  };

  // Check if user has a pick
  const hasSubmittedPick = !!userPick;

  // Initialize selection with user's current pick if it exists
  useEffect(() => {
    if (userPick) {
      setSelectedGameId(userPick.gameId);
      setSelectedTeamId(userPick.pickedTeamId);
    }
  }, [userPick]);

  // Sort games based on selected option
  const sortedGames = games ? [...games].sort((a, b) => {
    switch (sortOption) {
      case "spread":
        // Sort by absolute spread value (highest spread first)
        return Math.abs(Number(b.spread)) - Math.abs(Number(a.spread));
      case "homeUnderdog":
        // Home underdogs first (positive spread)
        return Number(b.spread) - Number(a.spread);
      case "gameTime":
        // Earliest games first
        return new Date(a.gameTime).getTime() - new Date(b.gameTime).getTime();
      default:
        return 0;
    }
  }) : [];

  // Get the selected week for lock status check
  const selectedWeek = allWeeks?.find(week => week.id === (selectedWeekId || activeWeekId));
  
  // Determine if picks are locked for the selected week
  // For admin UI: A week is "locked" if picks are not allowed
  // - If picksLockAt is in the past = locked (admin locked it or natural deadline passed)
  // - If picksLockAt is normal future deadline = locked (default state)
  // - If picksLockAt is far future (admin unlocked) = unlocked
  const arePicksLocked = selectedWeek ? (() => {
    const now = new Date();
    const lockTime = new Date(selectedWeek.picksLockAt);
    
    // If lockTime is in the past, definitely locked
    if (now >= lockTime) return true;
    
    // If lockTime is far in the future (more than 1 year from now), it's unlocked by admin
    const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    if (lockTime > oneYearFromNow) return false;
    
    // Otherwise, it's locked (normal deadline state)
    return true;
  })() : false;
  
  // Determine if the selected week allows picks (only current week + not locked)
  const canMakePicks = activeWeekId === pickableWeekId && !arePicksLocked;
  
  // Check if viewing a future week (picks not allowed yet)
  const isViewingFutureWeek = activeWeekId !== pickableWeekId && selectedWeekId && selectedWeekId !== pickableWeekId;

  // Loading state
  const isLoading = isLoadingWeek || isLoadingGames || isLoadingPick || isLoadingAuth;

  // Handle toggle lock/unlock picks for a specific week
  const handleToggleLock = async (weekId: number) => {
    setIsToggling(true);
    try {
      const response = await fetch(`/api/admin/week/${weekId}/toggle-lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leagueId: leagueId,
          locked: !arePicksLocked  // Toggle the current lock status
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Invalidate relevant queries to refresh the data
        queryClient.invalidateQueries({ queryKey: ["/api/nfl-weeks/current"] });
        queryClient.invalidateQueries({ queryKey: ["/api/nfl-weeks"] });
        
        toast({
          title: "Success",
          description: data.message || "Pick lock status updated successfully",
          variant: "default",
        });
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.message || "Failed to update pick lock status",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update pick lock status",
        variant: "destructive",
      });
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Helmet>
        <title>Pick Your Underdog | NFL Upset Pool</title>
        <meta name="description" content="Select your underdog team for this week's NFL games. Earn points based on the spread when your team wins outright." />
      </Helmet>
      
      {/* League Header with countdown and user's current pick */}
      <LeagueHeader leagueId={leagueId} hasSubmittedPick={hasSubmittedPick} userPick={userPick} />

      {/* Content Tabs */}
      <ContentTabs 
        activeTab={activeTab} 
        onTabChange={(tab) => setActiveTab(tab as Tab)} 
        isPicksLocked={arePicksLocked}
        isAdmin={isAdmin}
      />

      {/* Week Selector - positioned above all tab content */}
      {(activeTab === "spreads" || activeTab === "weeklypicks" || activeTab === "results") && activeWeekId && (
        <div className="mb-6 flex items-center justify-between">
          <WeekSelector 
            currentWeekId={selectedWeekId || activeWeekId} 
            onWeekChange={(weekId) => setSelectedWeekId(weekId)} 
            className=""
          />
          
          {/* Admin Lock/Unlock Controls - Only visible on Game Spreads tab */}
          {activeTab === "spreads" && isAdmin && (
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => handleToggleLock(selectedWeekId || activeWeekId)}
                variant={arePicksLocked ? "outline" : "default"}
                size="sm"
                disabled={isToggling}
                className={`${
                  arePicksLocked 
                    ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" 
                    : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                }`}
              >
                {isToggling ? (
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : arePicksLocked ? (
                  <Unlock className="h-4 w-4 mr-1" />
                ) : (
                  <Lock className="h-4 w-4 mr-1" />
                )}
                {arePicksLocked ? "Unlock Picks" : "Lock Picks"}
              </Button>
            </div>
          )}
        </div>
      )}

      <div>
        {/* Weekly Picks - Always available, shows different content based on lock status */}
        {activeTab === "weeklypicks" && activeWeekId && (
          <WeeklyPicks leagueId={leagueId} weekId={selectedWeekId || activeWeekId} isPicksLocked={arePicksLocked} />
        )}

        {/* Results Tab - Only visible to admins */}
        {activeTab === "results" && isAdmin && (
          <GameResults weekId={selectedWeekId || currentWeek?.id} />
        )}

        {/* Admin Tab - Only visible to admins */}
        {activeTab === "admin" && isAdmin && (
          <AdminControls leagueId={leagueId} />
        )}
        
        {/* Pick Selection */}
        {activeTab === "spreads" && (
          <div>
            <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6 border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary/10 to-secondary/10">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <h3 className="text-xl font-medium text-gray-900 flex items-center">
                    <Shield className="h-5 w-5 text-primary mr-2" />
                    Pick Selection
                  </h3>
                  
                  {userPick && (
                    <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium flex items-center">
                      <span className="mr-2">Current Pick:</span> 
                      <span className="font-bold">{userPick.pickedTeam?.name || "Selected Team"}</span>
                    </div>
                  )}
                  
                  <div className="relative inline-block">
                    <Select 
                      value={sortOption} 
                      onValueChange={(value) => setSortOption(value as SortOption)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spread">Spread Size</SelectItem>
                        <SelectItem value="homeUnderdog">Home Underdog</SelectItem>
                        <SelectItem value="gameTime">Game Time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4">
                {isLoading ? (
                  // Loading skeleton
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="mb-4">
                        <Skeleton className="h-36 w-full rounded-lg" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {sortedGames && sortedGames.length > 0 ? (
                      <form id="pick-form" onSubmit={(e) => { e.preventDefault(); handleSubmitPick(); }}>
                        {/* Simple grid of all games */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {sortedGames.map((game) => (
                            <NFLGameCard
                              key={game.id}
                              game={game}
                              selectedTeamId={selectedTeamId}
                              selectedGameId={selectedGameId}
                              onSelect={handleTeamSelection}
                              onSubmit={handleSubmitPick}
                              disabled={!canMakePicks || !isAuthenticated}
                              isViewingFutureWeek={isViewingFutureWeek}
                              isSubmitting={isSubmittingPick}
                            />
                          ))}
                        </div>
                        
                        {!isAuthenticated ? (
                          <div className="mt-8 bg-blue-50 p-6 rounded-md shadow-sm border border-blue-200">
                            <p className="text-center text-blue-700 font-medium">Please <a href="/api/login" className="font-bold underline hover:text-blue-800 transition-colors">log in</a> to make your pick</p>
                          </div>
                        ) : arePicksLocked ? (
                          <div className="mt-8 bg-red-50 p-6 rounded-md shadow-sm border border-red-200">
                            <p className="text-center text-red-700 font-medium">Picks are locked - deadline has passed (1:00 PM EST Sunday)</p>
                          </div>
                        ) : null}
                        
                        {/* Information messages */}
                        <div className="mt-8 text-center">
                          {selectedTeamId && canMakePicks && (
                            <p className="text-gray-600">
                              {hasSubmittedPick ? "You can change your pick until the picks lock." : "Your pick will be locked at 1:00 PM EST on Sunday."}
                            </p>
                          )}
                          {isViewingFutureWeek && (
                            <p className="text-amber-600 font-medium">
                              You are viewing a future week. Picks will be available 12 hours before the first game.
                            </p>
                          )}
                        </div>
                      </form>
                    ) : (
                      <div className="text-center py-12 px-4">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h3 className="mt-2 text-lg font-medium text-gray-900">No games available</h3>
                        <p className="mt-1 text-gray-500">There are no games available for this week.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "leaderboard" && (
          <div>
            <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6 border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary/10 to-secondary/10">
                <h3 className="text-xl font-medium text-gray-900 flex items-center">
                  <Trophy className="h-5 w-5 text-yellow-500 mr-2" />
                  Leaderboard
                </h3>
                <div className="flex items-center text-sm text-gray-500 mt-1">
                  <Calendar className="h-3.5 w-3.5 mr-1" />
                  <span>As of {new Date().toLocaleDateString(undefined, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</span>
                </div>
              </div>
              <div className="px-4 py-3">
                {isLoadingLeaderboard ? (
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
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Place</th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pooler</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {rankedLeaderboard && rankedLeaderboard.length > 0 ? (
                        rankedLeaderboard.map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50">
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
                              <div className="flex items-center">
                                <Avatar className="h-7 w-7 mr-2 border border-gray-200">
                                  <AvatarImage src={user.profileImageUrl || ""} alt={user.username} />
                                  <AvatarFallback className="bg-primary/10 text-primary">
                                    {user.firstName?.[0] || user.username?.[0]?.toUpperCase() || "?"}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{user.username}</span>
                              </div>
                            </td>
                          </tr>
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
        )}

        {activeTab === "messageboard" && (
          <div>
            <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6 border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary/10 to-secondary/10">
                <h3 className="text-xl font-medium text-gray-900 flex items-center">
                  <MessageSquare className="h-5 w-5 text-primary mr-2" />
                  League Discussion
                </h3>
              </div>
              <div className="p-12 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <h3 className="mt-2 text-lg font-medium text-gray-900">Coming Soon</h3>
                <p className="mt-1 text-gray-500">The messageboard feature will be available in a future update.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
