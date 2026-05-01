import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import LeagueHeader from "@/components/LeagueHeader";
import AdminControls from "@/components/AdminControls";
import ContentTabs from "@/components/ContentTabs";
import GolfLeagueView from "@/components/GolfLeagueView";
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
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as SelectPrimitive from "@radix-ui/react-select";
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
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  X,
  UserX,
  User as UserIcon,
  LogOut,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Helmet } from "react-helmet";
import { Link } from "wouter";

type Tab = "spreads" | "leaderboard" | "weeklypicks" | "results" | "admin" | "profile";
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
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

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
  // Prefer the first active (non-archived) league; fall back to first league if all archived
  useEffect(() => {
    if (userLeagues && Array.isArray(userLeagues) && userLeagues.length > 0) {
      if (selectedLeagueId === 1) {
        const activeLeague = userLeagues.find((m: any) => !m.league?.isArchived);
        const defaultLeague = activeLeague || userLeagues[0];
        if (defaultLeague?.league?.id) {
          setSelectedLeagueId(defaultLeague.league.id);
        }
      }
    }
  }, [userLeagues]); // Remove selectedLeagueId dependency to prevent re-triggering

  // Get current league info (including archive status, season, and sport type)
  // Placed before week queries so season is available for filtering
  const { data: currentLeagueInfo } = useQuery<{
    id: number;
    name: string;
    isArchived?: boolean;
    season?: number;
    sportType?: string;
    golfTournamentId?: number | null;
  }>({
    queryKey: [`/api/leagues/${leagueId}`],
    enabled: !!leagueId,
  });

  // The season for the currently selected league — used to scope week queries
  const leagueSeason = currentLeagueInfo?.season;

  // Reset selected week whenever the user switches leagues
  useEffect(() => {
    setSelectedWeekId(null);
  }, [leagueId]);

  // Get all NFL weeks scoped to this league's season
  const { data: allWeeks, isLoading: isLoadingAllWeeks } = useQuery<NFLWeek[]>({
    queryKey: [leagueSeason ? `/api/nfl-weeks?season=${leagueSeason}` : "/api/nfl-weeks"],
  });

  // Get the current NFL week scoped to this league's season
  const { data: currentWeek, isLoading: isLoadingWeek } = useQuery<NFLWeek>({
    queryKey: [leagueSeason ? `/api/nfl-weeks/current?season=${leagueSeason}` : "/api/nfl-weeks/current"],
  });

  // Set selected week when current week loads (or reloads after league switch)
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

  // Get league members to check admin status
  const { data: leagueMembers, isLoading: isLoadingMembers } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/members`],
  });

  // Check user's activation status in the league
  const { data: memberStatus } = useQuery<{
    isActive: boolean;
    isAdmin: boolean;
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

  // Check if user's picked game has already kicked off (pick is locked for the week)
  const isPickLockedByKickoff = (() => {
    if (!userPick || !games) return false;
    const pickedGame = games.find((g) => String(g.id) === String(userPick.gameId));
    if (!pickedGame) return false;
    const gameTimeStr = pickedGame.gameTime;
    let kickoff: Date;
    if (gameTimeStr.includes('Z') || gameTimeStr.includes('+') || (gameTimeStr.includes('-') && gameTimeStr.lastIndexOf('-') > 10)) {
      kickoff = new Date(gameTimeStr);
    } else {
      kickoff = new Date(gameTimeStr + 'Z');
    }
    return currentTime > kickoff;
  })();

  // Initialize selection with user's current pick if it exists
  useEffect(() => {
    if (userPick) {
      setSelectedGameId(String(userPick.gameId));
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

  // Determine if picks should be shown (locked) based on the SELECTED week's lock time
  const arePicksLocked = (() => {
    if (!currentWeek || !activeWeekId) return false;
    
    const now = new Date();
    
    // If viewing a previous week, picks are always visible (already locked)
    if (selectedWeekDetails && selectedWeekDetails.weekNumber < currentWeek.weekNumber) {
      return true;
    }
    
    // For current or future weeks, check if that week's lock time has passed
    if (selectedWeekDetails && selectedWeekDetails.picksLockAt) {
      return now >= new Date(selectedWeekDetails.picksLockAt);
    }
    
    // Fallback: check current week's lock time
    return now >= new Date(currentWeek.picksLockAt);
  })();

  // Determine if the selected week allows picks (only current week + not locked + not archived)
  const canMakePicks = activeWeekId === pickableWeekId && !arePicksLocked && !currentLeagueInfo?.isArchived;

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
                  value={selectedLeagueId?.toString() || ""}
                  onValueChange={(value) => setSelectedLeagueId(Number(value))}
                >
                  <SelectTrigger className="w-full sm:w-64 max-w-xs">
                    <SelectValue placeholder="Select a league" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const memberships = userLeagues && Array.isArray(userLeagues) ? userLeagues : [];
                      const activeLeagues = memberships.filter((m: any) => !m.league?.isArchived);
                      const archivedLeagues = memberships.filter((m: any) => m.league?.isArchived);

                      const renderItem = (membership: any) => {
                        const leagueId = membership.league?.id || membership.id;
                        const leagueName = membership.league?.name || membership.name;
                        const isArchived = membership.league?.isArchived;
                        const season = membership.league?.season;
                        const sportType = membership.league?.sportType ?? "nfl";
                        const tournamentName = membership.tournamentName;
                        const contextLabel = sportType === "golf" && tournamentName
                          ? tournamentName
                          : `NFL ${season ?? ""}`;
                        // Use SelectPrimitive.Item directly so the context label sits
                        // OUTSIDE SelectPrimitive.ItemText — keeping the trigger clean.
                        return (
                          <SelectPrimitive.Item
                            key={leagueId}
                            value={leagueId.toString()}
                            className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                          >
                            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                              <SelectPrimitive.ItemIndicator>
                                <Check className="h-4 w-4" />
                              </SelectPrimitive.ItemIndicator>
                            </span>
                            <SelectPrimitive.ItemText>
                              <span className={isArchived ? "text-gray-500" : ""}>
                                {leagueName}{isArchived && season ? ` — ${season}` : ""}
                              </span>
                            </SelectPrimitive.ItemText>
                            <span className="flex items-center gap-1.5 ml-1.5 flex-shrink-0">
                              <span className="text-xs text-gray-400">({contextLabel})</span>
                              {isArchived && <Lock className="h-3 w-3 text-gray-400" />}
                              {membership.isAdmin && !isArchived && <Trophy className="h-3 w-3 text-yellow-600" />}
                            </span>
                          </SelectPrimitive.Item>
                        );
                      };

                      return (
                        <>
                          {activeLeagues.length > 0 && (
                            <SelectGroup>
                              {archivedLeagues.length > 0 && (
                                <SelectLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                  Active Leagues
                                </SelectLabel>
                              )}
                              {activeLeagues.map(renderItem)}
                            </SelectGroup>
                          )}
                          {archivedLeagues.length > 0 && (
                            <SelectGroup>
                              <SelectLabel className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                Past Seasons
                              </SelectLabel>
                              {archivedLeagues.map(renderItem)}
                            </SelectGroup>
                          )}
                        </>
                      );
                    })()}
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

      {/* Golf League View — replaces all NFL content for golf leagues */}
      {currentLeagueInfo?.sportType === 'golf' && (
        <GolfLeagueView
          leagueId={leagueId}
          league={currentLeagueInfo as any}
          isSuperUser={Boolean(superUserStatus?.isSuperUser)}
          isAdmin={Boolean(isAdmin)}
        />
      )}

      {/* ── NFL League Content ── */}
      {(!currentLeagueInfo || currentLeagueInfo?.sportType !== 'golf') && (
        <>
      {/* League Header with countdown and user's current pick */}
      <div className="mb-6">
        <LeagueHeader
          leagueId={leagueId}
          hasSubmittedPick={hasSubmittedPick}
          userPick={userPick}
          selectedWeekId={selectedWeekId}
        />
      </div>

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

              {/* Inactive Member Banner */}
              {memberStatus && !memberStatus.isActive && !currentLeagueInfo?.isArchived && (
                <div className="bg-red-50 border-l-4 border-red-500 px-6 py-4">
                  <div className="flex items-center">
                    <UserX className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <div className="ml-3">
                      <p className="text-sm text-red-700 font-medium">
                        Your account is not active in this league
                      </p>
                      <p className="text-sm text-red-600 mt-1">
                        You cannot submit picks until your account is activated. Please reach out to your league administrator to get access.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Archived League Banner */}
              {currentLeagueInfo?.isArchived && (
                <div className="bg-gray-100 border-l-4 border-gray-500 px-6 py-4">
                  <div className="flex items-center">
                    <div className="flex">
                      <Lock className="h-5 w-5 text-gray-500" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-gray-700 font-medium">
                        League Archived
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        This league has been archived for the {currentLeagueInfo?.season || 2025} season. 
                        Picks and member changes are no longer allowed.
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
                    {isPickLockedByKickoff && !arePicksLocked && (
                      <div className="mb-4 bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-center gap-3">
                        <Lock className="h-5 w-5 text-amber-600 flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-amber-800">Your pick is locked for the week</p>
                          <p className="text-sm text-amber-700">Your selected game has kicked off. You can no longer change your pick this week.</p>
                        </div>
                      </div>
                    )}
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
                              submittedPickGameId={selectedWeekPick?.gameId ? String(selectedWeekPick.gameId) : null}
                              onSelect={handleTeamSelection}
                              onSubmit={handleSubmitPick}
                              disabled={!canMakePicks || !isAuthenticated}
                              isViewingFutureWeek={isViewingFutureWeek}
                              isSubmitting={isSubmittingPick}
                              isInactive={
                                memberStatus ? !memberStatus.isActive : null
                              }
                              isPickLockedByKickoff={isPickLockedByKickoff}
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
                              available 8 hours before the first game.
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
          <Leaderboard leagueId={leagueId} />
        )}

        {activeTab === "profile" && (
          <LeagueProfile leagueId={leagueId} memberStatus={memberStatus} onLeagueLeft={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/user/leagues"] });
            setSelectedLeagueId(1);
          }} />
        )}
      </div>
        </>
      )}
    </div>
  );
}

function LeagueProfile({ leagueId, memberStatus, onLeagueLeft }: {
  leagueId: number;
  memberStatus?: { isActive: boolean; isAdmin: boolean; nickname?: string | null } | null;
  onLeagueLeft?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [nicknameInput, setNicknameInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const { data: member, refetch: refetchMember } = useQuery<{ isActive: boolean; isAdmin: boolean; nickname?: string | null; isSoleAdmin?: boolean }>({
    queryKey: [`/api/league/${leagueId}/member-status`],
    enabled: !!user,
  });

  const currentNickname = member?.nickname || user?.username || "";

  const updateNicknameMutation = useMutation({
    mutationFn: async (nickname: string) => {
      const response = await apiRequest("PATCH", `/api/leagues/${leagueId}/nickname`, { nickname });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Nickname updated", description: "Your nickname has been updated for this league." });
      setIsEditing(false);
      refetchMember();
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/leaderboard`] });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${leagueId}/members`] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update nickname", variant: "destructive" });
    },
  });

  const leaveLeagueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/leagues/${leagueId}/leave`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Left league", description: "You have left the league." });
      queryClient.invalidateQueries({ queryKey: ["/api/user/leagues"] });
      onLeagueLeft?.();
      setLocation("/join-league");
    },
    onError: (error: Error) => {
      toast({ title: "Cannot leave", description: error.message || "Failed to leave league", variant: "destructive" });
    },
  });

  const handleEditNickname = () => {
    setNicknameInput(currentNickname);
    setIsEditing(true);
  };

  const handleSaveNickname = () => {
    if (!nicknameInput.trim()) return;
    updateNicknameMutation.mutate(nicknameInput.trim());
  };

  const handleLeaveLeague = () => {
    if (window.confirm("Are you sure you want to leave this league? This action cannot be undone.")) {
      leaveLeagueMutation.mutate();
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-primary" />
            League Profile
          </CardTitle>
          <CardDescription>
            Manage your display name and membership for this league.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">League Nickname</span>
              {!isEditing && (
                <Button variant="ghost" size="sm" onClick={handleEditNickname}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              )}
            </div>
            {isEditing ? (
              <div className="flex gap-2">
                <Input
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  maxLength={25}
                  placeholder="Enter nickname (3–25 characters)"
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveNickname(); if (e.key === "Escape") setIsEditing(false); }}
                />
                <Button
                  onClick={handleSaveNickname}
                  disabled={updateNicknameMutation.isPending || nicknameInput.trim().length < 3}
                  size="sm"
                >
                  {updateNicknameMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user?.profileImageUrl || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {currentNickname?.[0]?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-gray-900">{currentNickname}</p>
                  {member?.nickname && member.nickname !== user?.username && (
                    <p className="text-xs text-gray-500">Global username: {user?.username}</p>
                  )}
                </div>
              </div>
            )}
            <p className="text-xs text-gray-500">This name is shown on the leaderboard and weekly picks for this league only.</p>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Leave League</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {member?.isSoleAdmin
                    ? "You are the only admin. Transfer admin rights to another member before leaving."
                    : member?.isAdmin
                      ? "As an admin, you can leave since other admins exist."
                      : "Once you leave, you will need an invite code to rejoin."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleLeaveLeague}
                  disabled={leaveLeagueMutation.isPending || !!member?.isSoleAdmin}
                >
                  {leaveLeagueMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4 mr-1.5" />
                  )}
                  Leave League
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
