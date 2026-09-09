import { useQuery } from "@tanstack/react-query";
import { useCountdown } from "@/hooks/useCountdown";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NFLWeek, League, NFLGame } from "@/lib/types";
import { hasPostedSpread, spreadsPostAt } from "@shared/spreads";
import { formatWeeklyDate } from "@/lib/formatDate";
import { Clock, Trophy, Calendar, AlertTriangle, CheckCircle2, Database } from "lucide-react";
import SubmittedPickDisplay from "@/components/SubmittedPickDisplay";

type LeagueHeaderProps = {
  leagueId: number;
  hasSubmittedPick: boolean;
  userPick?: any; // User's current pick information
  selectedWeekId?: number; // The week being viewed (can be different from current week)
};

export default function LeagueHeader({ leagueId, hasSubmittedPick, userPick, selectedWeekId }: LeagueHeaderProps) {
  // Get current NFL week
  const { data: currentWeek, isLoading: isLoadingWeek } = useQuery<NFLWeek>({
    queryKey: ["/api/nfl-weeks/current"],
  });

  // Get all weeks to find selected week details
  const { data: allWeeks, isLoading: isLoadingAllWeeks } = useQuery<NFLWeek[]>({
    queryKey: ["/api/nfl-weeks"],
  });

  // Get league info
  const { data: league, isLoading: isLoadingLeague } = useQuery<League>({
    queryKey: [`/api/leagues/${leagueId}`],
  });

  // Determine which week to display (selected week or current week)
  const displayWeekId = selectedWeekId || currentWeek?.id;
  const displayWeek = allWeeks?.find(week => week.id === displayWeekId) || currentWeek;

  // Get games for the display week to check if spreads are available
  const { data: weekGames, isLoading: isLoadingGames, isError: gamesFailed } = useQuery<NFLGame[]>({
    queryKey: [`/api/nfl-games/week/${displayWeekId}`],
    enabled: !!displayWeekId,
    // Queries are cached with staleTime: Infinity, so without this a tab that
    // was open when the spreads posted keeps showing the pre-pull state until
    // someone reloads. Polls only around the trigger, and stops the moment a
    // line is up.
    refetchInterval: (query) => {
      const games = query.state.data;
      if (!games) return false;
      if (games.some(hasPostedSpread)) return false;
      const postAt = spreadsPostAt(games);
      // No games on the board yet: the pull creates them, so keep looking.
      if (!postAt) return 5 * 60 * 1000;
      return Date.now() >= postAt.getTime() - 15 * 60 * 1000 ? 60 * 1000 : false;
    },
  });

  // Check if spreads are available (any game has a posted line)
  const spreadsAvailable = useMemo(
    () => Boolean(weekGames?.some(hasPostedSpread)),
    [weekGames]
  );

  // When this week's spreads are due — null when the week has no games yet,
  // which is a different thing from "the pull time has passed".
  const dataPullTime = useMemo(
    () => (weekGames ? spreadsPostAt(weekGames) : null),
    [weekGames]
  );

  // Countdown to picks lock for the display week
  const lockDate = useMemo(() => 
    displayWeek?.picksLockAt ? new Date(displayWeek.picksLockAt) : null, 
    [displayWeek?.picksLockAt]
  );
  
  // Whether the week on screen differs from the week that can still be picked
  const isViewingOtherWeek =
    !!selectedWeekId && !!currentWeek && selectedWeekId !== currentWeek.id;
  const isViewingPastWeek =
    isViewingOtherWeek &&
    !!displayWeek &&
    !!currentWeek &&
    displayWeek.weekNumber < currentWeek.weekNumber;
  const currentWeekLabel = currentWeek
    ? `Week ${currentWeek.weekNumber}`
    : "this week";

  // Use appropriate countdown based on spreads availability
  const countdownTarget = spreadsAvailable ? lockDate : dataPullTime;
  const { days, hours, minutes, isExpired } = useCountdown(countdownTarget);

  // useCountdown reports a null target as expired, so "Any moment now" used to
  // be what a week with no games — or a games request that failed — rendered
  // as, indefinitely. Say what is actually true in each case instead.
  const spreadsLabel = dataPullTime && !gamesFailed ? "Spreads post in" : "Spreads";
  const spreadsValue = gamesFailed
    ? "Status unavailable"
    : !dataPullTime
      ? "Waiting on the schedule"
      : isExpired
        ? "Any moment now"
        : `${days}d ${hours}h ${minutes}m`;

  if (isLoadingWeek || isLoadingLeague || (!!displayWeekId && isLoadingGames)) {
    return (
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-6 w-96" />
          </div>
          <div className="mt-4 md:mt-0">
            <Skeleton className="h-14 w-80" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg p-6 shadow-md border border-primary/20">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6">
          {/* Left: Header info */}
          <div className="flex-shrink-0">
            <div className="flex items-center mb-2">
              <Trophy className="h-6 w-6 text-accent mr-2" />
              <h2 className="text-2xl font-bold text-gray-900">
                {league?.name || "NFL Upset Pool"}
              </h2>
            </div>
            
            {displayWeek && (
              <div className="flex items-center text-gray-600 mb-3">
                <Calendar className="h-4 w-4 mr-1" />
                <p className="text-sm">
                  Week {displayWeek.weekNumber} ({formatWeeklyDate(displayWeek.startDate)} - {formatWeeklyDate(displayWeek.endDate)})
                  {isViewingOtherWeek && (
                    <span className="ml-2 text-amber-600 font-medium">
                      {isViewingPastWeek ? "(finished week)" : "(upcoming week)"}
                    </span>
                  )}
                </p>
              </div>
            )}
            
            {/* Status message — always about the current week, which is the
                only week that can still be picked. Naming the week keeps it
                from being read as a statement about the week on screen. */}
            {!hasSubmittedPick ? (
              <div className="flex items-center text-red-600">
                <AlertTriangle className="h-5 w-5 mr-1" />
                <p className="font-medium">
                  No pick yet for {currentWeekLabel}
                </p>
              </div>
            ) : (
              <div className="flex items-center text-green-600">
                <CheckCircle2 className="h-5 w-5 mr-1" />
                <p className="font-medium">
                  Pick saved for {currentWeekLabel}
                </p>
              </div>
            )}
          </div>

          {/* Center: Pick display */}
          {hasSubmittedPick && userPick && userPick.pickedTeam && (
            <div className="flex-grow flex justify-center">
              <div className="w-full max-w-sm">
                <SubmittedPickDisplay userPick={userPick} />
              </div>
            </div>
          )}
          
          {/* Right: Countdown timer */}
          <div className="flex-shrink-0">
            <div className={`rounded-lg px-5 py-4 shadow-md flex items-center 
              ${isExpired 
                ? "bg-red-100 border border-red-200" 
                : spreadsAvailable 
                  ? "bg-gradient-to-r from-blue-100 to-purple-100 border border-blue-200"
                  : "bg-gradient-to-r from-amber-100 to-yellow-100 border border-amber-200"}`
            }>
              {spreadsAvailable ? (
                <Clock className={`h-6 w-6 ${isExpired ? "text-red-500" : "text-blue-500"} mr-3`} />
              ) : (
                <Database className="h-6 w-6 text-amber-600 mr-3" />
              )}
              <div>
                {spreadsAvailable ? (
                  <>
                    <div className="text-sm font-medium text-gray-700">Picks lock in</div>
                    {isExpired ? (
                      <div className="countdown-timer font-bold text-red-600 text-lg">
                        Picks are locked
                      </div>
                    ) : (
                      <div className="countdown-timer font-bold text-blue-800 text-lg">
                        {days}d {hours}h {minutes}m
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium text-gray-700">{spreadsLabel}</div>
                    <div className="countdown-timer font-bold text-amber-800 text-lg">
                      {spreadsValue}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
