import { useQuery } from "@tanstack/react-query";
import { useCountdown } from "@/hooks/useCountdown";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NFLWeek, League } from "@/lib/types";
import { formatWeeklyDate } from "@/lib/formatDate";
import { Clock, Trophy, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";

type LeagueHeaderProps = {
  leagueId: number;
  hasSubmittedPick: boolean;
  userPick?: any; // User's current pick information
};

export default function LeagueHeader({ leagueId, hasSubmittedPick, userPick }: LeagueHeaderProps) {
  // Get current NFL week
  const { data: currentWeek, isLoading: isLoadingWeek } = useQuery<NFLWeek>({
    queryKey: ["/api/nfl-weeks/current"],
  });

  // Get league info
  const { data: league, isLoading: isLoadingLeague } = useQuery<League>({
    queryKey: [`/api/leagues/${leagueId}`],
  });

  // Countdown to picks lock (Sunday 1 PM EST)
  // Memoize the lock date to prevent infinite renders
  const lockDate = useMemo(() => 
    currentWeek?.picksLockAt ? new Date(currentWeek.picksLockAt) : null, 
    [currentWeek?.picksLockAt]
  );
  
  const { days, hours, minutes, isExpired } = useCountdown(lockDate);

  if (isLoadingWeek || isLoadingLeague) {
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
        <div className="flex flex-col md:flex-row md:justify-between md:items-center">
          <div>
            <div className="flex items-center mb-2">
              <Trophy className="h-6 w-6 text-accent mr-2" />
              <h2 className="text-2xl font-bold text-gray-900">
                {league?.name || "NFL Upset Pool"}
              </h2>
            </div>
            
            {currentWeek && (
              <div className="flex items-center text-gray-600 mb-3">
                <Calendar className="h-4 w-4 mr-1" />
                <p className="text-sm">
                  Week {currentWeek.weekNumber} ({formatWeeklyDate(currentWeek.startDate)} - {formatWeeklyDate(currentWeek.endDate)})
                </p>
              </div>
            )}
            
            {/* Status message and pick selection */}
            {!hasSubmittedPick ? (
              <div className="flex items-center text-red-600">
                <AlertTriangle className="h-5 w-5 mr-1" />
                <p className="font-medium">You have not submitted a pick for this week</p>
              </div>
            ) : userPick && userPick.pickedTeam && userPick.game ? (
              <div className="flex flex-col">
                <div className="flex items-center text-green-600 mb-2">
                  <CheckCircle2 className="h-5 w-5 mr-1" />
                  <p className="font-medium">Pick submitted for this week</p>
                </div>
                
                {/* Prominent pick display */}
                <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-200 shadow-sm">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-sm font-medium text-gray-600">Your Selected Game:</div>
                    <div className="bg-primary text-white text-xs font-bold px-2 py-1 rounded-sm">
                      Selected Pick
                    </div>
                  </div>
                  
                  <div className="flex items-center mt-1">
                    <div className="w-10 h-10 flex-shrink-0 mr-3">
                      <img 
                        src={userPick.pickedTeam.logoUrl} 
                        alt={`${userPick.pickedTeam.name} logo`} 
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-gray-900">{userPick.pickedTeam.name}</div>
                      <div className="flex items-center text-sm">
                        <span className="bg-lime-100 text-lime-800 px-2 py-0.5 rounded text-xs font-medium mr-2">
                          UNDERDOG +{Math.abs(Number(userPick.game.spread || 0)).toFixed(1)}
                        </span>
                        <span className="text-gray-600 text-xs">
                          vs. {userPick.game.homeTeam.id === userPick.pickedTeam.id ? 
                            userPick.game.awayTeam.name : userPick.game.homeTeam.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            
          </div>
          
          <div className="mt-6 md:mt-0">
            <div className={`rounded-lg px-5 py-4 shadow-md flex items-center 
              ${isExpired 
                ? "bg-red-100 border border-red-200" 
                : "bg-gradient-to-r from-blue-100 to-purple-100 border border-blue-200"}`
            }>
              <Clock className={`h-6 w-6 ${isExpired ? "text-red-500" : "text-blue-500"} mr-3`} />
              <div>
                <div className="text-sm font-medium text-gray-700">Picks lock:</div>
                {isExpired ? (
                  <div className="countdown-timer font-bold text-red-600 text-lg">
                    Picks are locked
                  </div>
                ) : (
                  <div className="countdown-timer font-bold text-blue-800 text-lg">
                    {days}d {hours}h {minutes}m
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
