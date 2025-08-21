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
import CreateLeague from "@/components/CreateLeague";
import JoinLeague from "@/components/JoinLeague";
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
import {
  Shield,
  MessageSquare,
  Trophy,
  Medal,
  Calendar,
  Loader2,
  Check,
  Lock,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Helmet } from "react-helmet";
import { Link } from "wouter";

type Tab = "spreads" | "leaderboard" | "weeklypicks" | "results" | "admin";
type SortOption = "spread" | "homeUnderdog" | "gameTime";

export default function Home() {
  const { user, isAuthenticated, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();

  // Check if current user is super user
  const { data: superUserStatus } = useQuery<{ isSuperUser: boolean }>({
    queryKey: ["/api/auth/super-user-status"],
    enabled: isAuthenticated,
  });
  const [activeTab, setActiveTab] = useState<Tab>("spreads");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("gameTime");
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number>(1);

  // Dynamic league ID based on user selection
  const leagueId = selectedLeagueId;

  // Get user's leagues for the selector
  const { data: userLeagues, isLoading: isLoadingUserLeagues } = useQuery<
    any[]
  >({
    queryKey: ["/api/user/leagues"],
    enabled: isAuthenticated,
  });

  // Set default league when user leagues load (only on initial load)
  useEffect(() => {
    if (userLeagues && Array.isArray(userLeagues) && userLeagues.length > 0) {
      // Only set default if we're still on the initial default (1) and haven't made a selection yet
      if (selectedLeagueId === 1) {
        const firstLeague = userLeagues[0];
        if (firstLeague?.league?.id) {
          setSelectedLeagueId(firstLeague.league.id);
        }
      }
    }
  }, [userLeagues]); // Remove selectedLeagueId dependency to prevent re-triggering

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
  const { data: databaseGames, isLoading: isLoadingDatabaseGames } = useQuery<
    NFLGame[]
  >({
    queryKey: [`/api/nfl-games/week/${activeWeekId}`],
    enabled: !!activeWeekId,
  });

  // Set the games from the database
  const allGames = databaseGames;

  // Filter games by the selected week and sort by date
  const games = useMemo(() => {
    if (!allGames) return [];

    return allGames
      .filter((game) => (activeWeekId ? game.weekId === activeWeekId : true))
      .sort(
        (a, b) =>
          new Date(a.gameTime).getTime() - new Date(b.gameTime).getTime(),
      );
  }, [allGames, activeWeekId]);

  const isLoadingGames = isLoadingDatabaseGames;

  // Get the user's pick for the current week (picks only for current week)
  const {
    data: userPick,
    isLoading: isLoadingPick,
    refetch: refetchUserPick,
  } = useQuery<UserPick | null>({
    queryKey: ["/api/user/pick", { weekId: pickableWeekId, leagueId }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (pickableWeekId) params.append("weekId", pickableWeekId.toString());
      params.append("leagueId", leagueId.toString());
      return fetch(`/api/user/pick?${params.toString()}`, {
        credentials: "include",
      }).then((res) => res.json());
    },
    enabled: !!pickableWeekId && isAuthenticated,
  });

  // Get the user's pick for the selected week (for display purposes)
  const { data: selectedWeekPick, isLoading: isLoadingSelectedWeekPick } =
    useQuery<UserPick | null>({
      queryKey: ["/api/user/pick", { weekId: activeWeekId, leagueId }],
      queryFn: () => {
        const params = new URLSearchParams();
        if (activeWeekId) params.append("weekId", activeWeekId.toString());
        params.append("leagueId", leagueId.toString());
        return fetch(`/api/user/pick?${params.toString()}`, {
          credentials: "include",
        }).then((res) => res.json());
      },
      enabled: !!activeWeekId && isAuthenticated,
    });

  // Get the current selected week details for display
  const selectedWeekDetails = allWeeks?.find(
    (week) => week.id === activeWeekId,
  );

  // Get the leaderboard data
  const { data: leaderboard, isLoading: isLoadingLeaderboard } = useQuery<
    User[]
  >({
    queryKey: [`/api/league/${leagueId}/leaderboard`],
  });

  // Function to calculate proper rankings with ties
  const calculateRankings = (users: User[]) => {
    if (!users || users.length === 0) return [];

    // Sort users by points (descending)
    const sortedUsers = [...users].sort((a, b) => {
      const aPoints = parseFloat(String(a.totalPoints || "0"));
      const bPoints = parseFloat(String(b.totalPoints || "0"));
      return bPoints - aPoints;
    });

    // Calculate rankings with proper tie handling
    const rankedUsers = [];
    let currentRank = 1;

    for (let i = 0; i < sortedUsers.length; i++) {
      const user = sortedUsers[i];
      const currentPoints = parseFloat(String(user.totalPoints || "0"));

      // If this isn't the first user and points are different from previous user
      if (i > 0) {
        const previousPoints = parseFloat(
          String(sortedUsers[i - 1].totalPoints || "0"),
        );
        if (currentPoints !== previousPoints) {
          currentRank = i + 1; // Set rank to position + 1
        }
        // If points are the same, keep the same rank
      }

      rankedUsers.push({
        ...user,
        rank: currentRank,
      });
    }

    return rankedUsers;
  };

  const rankedLeaderboard = leaderboard ? calculateRankings(leaderboard) : [];

  // Get league members to check admin status
  const { data: leagueMembers, isLoading: isLoadingMembers } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/members`],
  });

  // Check user's activation status in the league
  const { data: memberStatus } = useQuery<{
    isActive: boolean;
    isAdmin: boolean;
    hasPaid: boolean;
  }>({
    queryKey: [`/api/league/${leagueId}/member-status`],
    enabled: !!user,
  });

  // Check if user is an admin for this league
  const isAdmin =
    user &&
    leagueMembers &&
    Array.isArray(leagueMembers) &&
    leagueMembers.some(
      (member: any) => member.userId === user.id && member.isAdmin,
    );

  // Mutation for submitting a pick
  const { mutate: submitPick, isPending: isSubmittingPick } = useMutation({
    mutationFn: async (data: {
      gameId: string;
      pickedTeamId: number;
      leagueId: number;
      weekId: number;
    }) => {
      return apiRequest("POST", "/api/user/pick", data);
    },
    onSuccess: (data) => {
      // Invalidate all related queries for immediate UI updates
      queryClient.invalidateQueries({ queryKey: ["/api/user/pick"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/league/${leagueId}/week/${activeWeekId}/picks`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/league/${leagueId}/leaderboard`],
      });

      // First fetch the updated pick to ensure we have the latest data
      refetchUserPick().then(() => {
        // Find the selected team info for better UI feedback
        const selectedGame = games?.find((game) => game.id === selectedGameId);
        const selectedTeam = selectedGame
          ? selectedGame.homeTeamId === selectedTeamId
            ? selectedGame.homeTeam
            : selectedGame.awayTeam
          : null;

        toast({
          title: "Pick Submitted!",
          description: selectedTeam
            ? `You've selected ${selectedTeam.name} as your pick for this week`
            : "Your pick has been saved",
          variant: "default",
        });
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to submit pick",
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
    const selectedGame = games?.find((game) => game.id === selectedGameId);
    const isHomeTeamSelected = selectedGame?.homeTeam.id === selectedTeamId;
    const selectedTeamInfo = isHomeTeamSelected
      ? selectedGame?.homeTeam
      : selectedGame?.awayTeam;

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
  const sortedGames = games
    ? [...games].sort((a, b) => {
        switch (sortOption) {
          case "spread":
            // Sort by absolute spread value (highest spread first)
            return Math.abs(Number(b.spread)) - Math.abs(Number(a.spread));
          case "homeUnderdog":
            // Home underdogs first (positive spread)
            return Number(b.spread) - Number(a.spread);
          case "gameTime":
            // Earliest games first
            return (
              new Date(a.gameTime).getTime() - new Date(b.gameTime).getTime()
            );
          default:
            return 0;
        }
      })
    : [];

  // Determine if picks are locked for the current week
  const arePicksLocked = currentWeek
    ? new Date() >= new Date(currentWeek.picksLockAt)
    : false;

  // Determine if the selected week allows picks (only current week + not locked)
  const canMakePicks = activeWeekId === pickableWeekId && !arePicksLocked;

  // Check if viewing a future week (picks not allowed yet)
  const isViewingFutureWeek =
    activeWeekId !== pickableWeekId &&
    selectedWeekId &&
    selectedWeekId !== pickableWeekId;

  // Loading state
  const isLoading =
    isLoadingWeek || isLoadingGames || isLoadingPick || isLoadingAuth;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Helmet>
        <title>Pick Your Underdog | NFL Upset Pool</title>
        <meta
          name="description"
          content="Select your underdog team for this week's NFL games. Earn points based on the spread when your team wins outright."
        />
      </Helmet>

      {/* League Selector */}
      {isAuthenticated && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full lg:w-auto">
              <div className="flex items-center flex-shrink-0">
                <Users className="h-5 w-5 text-primary mr-2" />
                <span className="text-sm font-medium text-gray-700">
                  League:
                </span>
              </div>
              {isLoadingUserLeagues ? (
                <Skeleton className="h-8 w-full sm:w-48" />
              ) : (
                <Select
                  value={selectedLeagueId.toString()}
                  onValueChange={(value) => setSelectedLeagueId(Number(value))}
                >
                  <SelectTrigger className="w-full sm:w-64 max-w-xs">
                    <SelectValue placeholder="Select a league" />
                  </SelectTrigger>
                  <SelectContent>
                    {userLeagues &&
                      Array.isArray(userLeagues) &&
                      userLeagues.map((membership: any) => (
                        <SelectItem
                          key={membership.league?.id || membership.id}
                          value={(
                            membership.league?.id || membership.id
                          ).toString()}
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate">
                              {membership.league?.name || membership.name}
                            </span>
                            {membership.isAdmin && (
                              <Trophy className="h-3 w-3 text-yellow-600 flex-shrink-0" />
                            )}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <CreateLeague
                onLeagueCreated={(league) => {
                  toast({
                    title: "Success!",
                    description: `${league.name} has been created. You can now manage it from your leagues.`,
                  });
                  // Refetch user leagues to include the new league
                  queryClient.invalidateQueries({
                    queryKey: ["/api/user/leagues"],
                  });
                  // Switch to the newly created league
                  setSelectedLeagueId(league.id);
                }}
              />
              <JoinLeague
                onLeagueJoined={(league) => {
                  // Switch to the newly joined league
                  setSelectedLeagueId(league.id);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* League Header with countdown and user's current pick */}
      <div className="mb-6">
        <LeagueHeader
          leagueId={leagueId}
          hasSubmittedPick={hasSubmittedPick}
          userPick={userPick}
          selectedWeekId={selectedWeekId}
        />
      </div>

      {/* Deactivated User Banner */}
      {memberStatus && !memberStatus.isActive && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <Lock className="h-5 w-5 text-red-500 mr-3 flex-shrink-0" />
            <div>
              <p className="text-red-800 font-medium">
                Your team is not activated. Contact your league admin to start
                picking upsets.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content Tabs */}
      <ContentTabs
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as Tab)}
        isPicksLocked={arePicksLocked}
        isAdmin={Boolean(isAdmin)}
        isSuperUser={Boolean(superUserStatus?.isSuperUser)}
      />

      {/* Week Selector - positioned above all tab content */}
      {(activeTab === "spreads" ||
        activeTab === "weeklypicks" ||
        activeTab === "results") &&
        activeWeekId && (
          <div className="mb-6">
            <WeekSelector
              currentWeekId={selectedWeekId || activeWeekId}
              onWeekChange={(weekId) => setSelectedWeekId(weekId)}
              className=""
            />
          </div>
        )}

      <div>
        {/* Weekly Picks - Always available, shows different content based on lock status */}
        {activeTab === "weeklypicks" && activeWeekId && (
          <WeeklyPicks
            leagueId={leagueId}
            weekId={selectedWeekId || activeWeekId}
            isPicksLocked={arePicksLocked}
          />
        )}

        {/* Results Tab - Only visible to super users */}
        {activeTab === "results" && Boolean(superUserStatus?.isSuperUser) && (
          <GameResults weekId={selectedWeekId || currentWeek?.id || 0} />
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

                  {selectedWeekPick && selectedWeekDetails && (
                    <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium flex items-center">
                      <span className="mr-2">
                        Week {selectedWeekDetails.weekNumber} Pick:
                      </span>
                      <span className="font-bold">
                        {selectedWeekPick.pickedTeam?.name || "Selected Team"}
                      </span>
                    </div>
                  )}

                  <div className="relative inline-block">
                    <Select
                      value={sortOption}
                      onValueChange={(value) =>
                        setSortOption(value as SortOption)
                      }
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spread">Spread Size</SelectItem>
                        <SelectItem value="homeUnderdog">
                          Home Underdog
                        </SelectItem>
                        <SelectItem value="gameTime">Game Time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Payment Warning Banner */}
              {memberStatus && !memberStatus.hasPaid && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 px-6 py-4">
                  <div className="flex items-center">
                    <div className="flex">
                      <svg
                        className="h-5 w-5 text-yellow-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-yellow-700 font-medium">
                        Payment Required
                      </p>
                      <p className="text-sm text-yellow-600 mt-1">
                        Your picks will not be counted until you have paid for
                        the league. Venmo @doug-horn-1 $30 to get started.
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
                      <form
                        id="pick-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleSubmitPick();
                        }}
                      >
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
                              isInactive={
                                memberStatus ? !memberStatus.isActive : null
                              }
                            />
                          ))}
                        </div>

                        {!isAuthenticated ? (
                          <div className="mt-8 bg-blue-50 p-6 rounded-md shadow-sm border border-blue-200">
                            <p className="text-center text-blue-700 font-medium">
                              Please{" "}
                              <a
                                href="/api/login"
                                className="font-bold underline hover:text-blue-800 transition-colors"
                              >
                                log in
                              </a>{" "}
                              to make your pick
                            </p>
                          </div>
                        ) : arePicksLocked ? (
                          <div className="mt-8 bg-red-50 p-6 rounded-md shadow-sm border border-red-200">
                            <p className="text-center text-red-700 font-medium">
                              Picks are locked - deadline has passed (1:00 PM
                              EST Sunday)
                            </p>
                          </div>
                        ) : null}

                        {/* Information messages */}
                        <div className="mt-8 text-center">
                          {selectedTeamId && canMakePicks && (
                            <p className="text-gray-600">
                              {hasSubmittedPick
                                ? "You can change your pick until the picks lock."
                                : "Your pick will be locked at 1:00 PM EST on Sunday."}
                            </p>
                          )}
                          {isViewingFutureWeek && (
                            <p className="text-amber-600 font-medium">
                              You are viewing a future week. Picks will be
                              available 12 hours before the first game.
                            </p>
                          )}
                        </div>
                      </form>
                    ) : (
                      <div className="text-center py-12 px-4">
                        <svg
                          className="mx-auto h-12 w-12 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <h3 className="mt-2 text-lg font-medium text-gray-900">
                          No games available
                        </h3>
                        <p className="mt-1 text-gray-500">
                          There are no games available for this week.
                        </p>
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
                  <span>
                    As of{" "}
                    {new Date().toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
              <div className="px-4 py-3">
                {isLoadingLeaderboard ? (
                  <div className="px-6 py-4">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={index}
                        className="flex items-center space-x-4 py-3"
                      >
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
                        <th
                          scope="col"
                          className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Place
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Score
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Pooler
                        </th>
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
                                  <span className="font-medium text-gray-700 mx-1">
                                    {user.rank}
                                  </span>
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
                                  <AvatarImage
                                    src={user.profileImageUrl || ""}
                                    alt={user.username}
                                  />
                                  <AvatarFallback className="bg-primary/10 text-primary">
                                    {user.firstName?.[0] ||
                                      user.username?.[0]?.toUpperCase() ||
                                      "?"}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">
                                  {user.username}
                                </span>
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
                              <p className="text-xs mt-1">
                                Make your pick to join the leaderboard!
                              </p>
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
      </div>
    </div>
  );
}
