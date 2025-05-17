import { useQuery } from "@tanstack/react-query";
import { useCountdown } from "@/hooks/useCountdown";
import { Skeleton } from "@/components/ui/skeleton";
import { NFLWeek, League } from "@/lib/types";
import { formatWeeklyDate } from "@/lib/formatDate";
import { Clock } from "lucide-react";

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
      <div className="flex flex-col md:flex-row md:justify-between md:items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            League: <span className="text-primary">{league?.name || "[Upset Pool]"}</span>
          </h2>
          <p className={`${hasSubmittedPick ? "text-green-600" : "text-red-600"} font-medium`}>
            {hasSubmittedPick 
              ? "You have submitted a pick for this week" 
              : "You have not submitted a pick for this week"}
          </p>
        </div>
        <div className="mt-4 md:mt-0">
          <div className="bg-white rounded-lg shadow-sm px-4 py-3 border border-yellow-300 flex items-center">
            <Clock className="h-5 w-5 text-yellow-500 mr-2" />
            <span className="font-medium">Picks lock:</span>
            {isExpired ? (
              <span className="ml-2 countdown-timer font-semibold text-red-600">Picks are locked</span>
            ) : (
              <span className="ml-2 countdown-timer font-semibold">
                {days} {days === 1 ? "day" : "days"}, {hours} {hours === 1 ? "hour" : "hours"}, {minutes} {minutes === 1 ? "minute" : "minutes"}
              </span>
            )}
          </div>
        </div>
      </div>
      {currentWeek && (
        <p className="text-sm text-gray-500 mt-1">
          Week {currentWeek.weekNumber} ({formatWeeklyDate(currentWeek.startDate)} - {formatWeeklyDate(currentWeek.endDate)})
        </p>
      )}
    </div>
  );
}
