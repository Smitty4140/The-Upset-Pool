import { useQuery } from "@tanstack/react-query";
import { useCountdown } from "@/hooks/useCountdown";
import { Skeleton } from "@/components/ui/skeleton";
import { NFLWeek, League } from "@/lib/types";
import { formatWeeklyDate } from "@/lib/formatDate";
import { Clock, Trophy, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";

type LeagueHeaderProps = {
  leagueId: number;
  hasSubmittedPick: boolean;
};

export default function LeagueHeader({ leagueId, hasSubmittedPick }: LeagueHeaderProps) {
  // Get current NFL week
  const { data: currentWeek, isLoading: isLoadingWeek } = useQuery<NFLWeek>({
    queryKey: ["/api/nfl-weeks/current"],
  });

  // Get league info
  const { data: league, isLoading: isLoadingLeague } = useQuery<League>({
    queryKey: [`/api/leagues/${leagueId}`],
  });

  // Countdown to picks lock (Sunday 1 PM EST)
  const { days, hours, minutes, isExpired } = useCountdown(
    currentWeek?.picksLockAt ? new Date(currentWeek.picksLockAt) : null
  );

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
            
            <div className={`flex items-center ${hasSubmittedPick ? "text-green-600" : "text-red-600"}`}>
              {hasSubmittedPick ? (
                <>
                  <CheckCircle2 className="h-5 w-5 mr-1" />
                  <p className="font-medium">You have submitted a pick for this week</p>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 mr-1" />
                  <p className="font-medium">You have not submitted a pick for this week</p>
                </>
              )}
            </div>
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
