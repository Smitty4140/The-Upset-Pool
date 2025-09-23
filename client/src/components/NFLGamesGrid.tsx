import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NFLGame, NFLTeam, NFLWeek } from "@/lib/types";
import NFLGameCard from "./NFLGameCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, CheckCircle, Info, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCountdown } from "@/hooks/useCountdown";
import { apiRequest } from "@/lib/queryClient";

interface NFLGamesGridProps {
  weekId: number;
  leagueId: number;
  hasSubmittedPick: boolean;
  userPick?: any;
  onPickSubmit: () => void;
}

export default function NFLGamesGrid({
  weekId,
  leagueId,
  hasSubmittedPick,
  userPick,
  onPickSubmit
}: NFLGamesGridProps) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(userPick?.gameId?.toString() || null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(userPick?.pickedTeamId || null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Auto-refresh the current time to keep game lock status synchronized
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Fetch games data for the selected week
  const { data: games, isLoading: isLoadingGames } = useQuery<(NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam })[]>({
    queryKey: [`/api/nfl-games/week/${weekId}`],
  });

  // Fetch week data to check if picks are locked
  const { data: week } = useQuery<NFLWeek>({
    queryKey: [`/api/nfl-weeks/${weekId}`],
  });
  
  // Calculate whether picks are locked based on the week's picksLockAt time
  const isLocked = week ? new Date(week.picksLockAt) < new Date() : false;
  
  // Check if user's current pick is locked due to their selected game having started
  const isPickLocked = userPick && userPick.game ? 
    new Date(userPick.game.gameTime) < new Date() : false;
  
  // Setup countdown to lock time
  const lockDate = week ? new Date(week.picksLockAt) : null;
  const countdown = useCountdown(lockDate);

  // Mutation for submitting a pick
  const submitPickMutation = useMutation({
    mutationFn: (pick: { gameId: string; teamId: number }) => {
      return apiRequest({
        url: "/api/user/pick",
        method: "POST",
        data: {
          gameId: pick.gameId,
          pickedTeamId: pick.teamId,
          leagueId: leagueId,
          weekId: weekId,
        },
      });
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Your pick has been submitted.",
        variant: "success",
      });
      // Invalidate all related queries for immediate UI updates
      queryClient.invalidateQueries({ queryKey: ["/api/user/pick"] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/week/${weekId}/picks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/leaderboard`] });
      onPickSubmit();
    },
    onError: (error: any) => {
      console.error("Error submitting pick:", error);
      const errorMessage = error?.response?.data?.message || "Failed to submit your pick. Please try again.";
      toast({
        title: "Error!",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Handler for selecting a game and team
  const handleSelectGame = (gameId: string, teamId: number) => {
    if (isLocked || hasSubmittedPick || isPickLocked) return;
    
    setSelectedGameId(gameId);
    setSelectedTeamId(teamId);
  };

  // Handler for submitting the pick
  const handleSubmitPick = () => {
    if (!selectedGameId || !selectedTeamId) {
      toast({
        title: "Error!",
        description: "Please select a team to continue.",
        variant: "destructive",
      });
      return;
    }

    submitPickMutation.mutate({
      gameId: selectedGameId,
      teamId: selectedTeamId,
    });
  };

  // Skeleton loading state
  if (isLoadingGames) {
    return (
      <div className="space-y-4 mt-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // No games available message
  if (!games || games.length === 0) {
    return (
      <div className="text-center py-8 border rounded-lg bg-gray-50">
        <Info className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-lg font-medium text-gray-900">No games available</h3>
        <p className="mt-1 text-sm text-gray-500">There are no games scheduled for this week.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!isLocked && !hasSubmittedPick && !isPickLocked && (
        <div className="flex items-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <Calendar className="h-5 w-5 text-yellow-500 mr-2 flex-shrink-0" />
          <span className="text-sm text-yellow-700">
            {!countdown.isExpired ? (
              <>
                Picks lock in {countdown.days > 0 ? `${countdown.days}d ` : ''}
                {countdown.hours > 0 ? `${countdown.hours}h ` : ''}
                {countdown.minutes}m {countdown.seconds}s
              </>
            ) : (
              <>Picks are now locked</>
            )}
          </span>
        </div>
      )}

      {hasSubmittedPick && isPickLocked && (
        <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg">
          <Lock className="h-5 w-5 text-red-500 mr-2 flex-shrink-0" />
          <span className="text-sm text-red-700">
            Error: You cannot make a new pick. Your selected game has started and you are LOCKED IN
          </span>
        </div>
      )}

      {hasSubmittedPick && !isPickLocked && (
        <div className="flex items-center p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
          <span className="text-sm text-green-700">
            You've submitted your pick for Week {week?.weekNumber}!
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {games.map((game) => (
          <NFLGameCard
            key={game.id}
            game={game}
            selectedGameId={selectedGameId}
            selectedTeamId={selectedTeamId}
            onSelect={handleSelectGame}
            disabled={isLocked || hasSubmittedPick || isPickLocked}
          />
        ))}
      </div>

      {!isLocked && !hasSubmittedPick && !isPickLocked && (
        <div className="flex justify-center mt-6">
          <Button
            onClick={handleSubmitPick}
            disabled={!selectedGameId || !selectedTeamId || submitPickMutation.isPending}
            className="px-8 py-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {submitPickMutation.isPending ? (
              <div className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Submitting...
              </div>
            ) : (
              "Submit Pick"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}