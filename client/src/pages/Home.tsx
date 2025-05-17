import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import LeagueHeader from "@/components/LeagueHeader";
import ContentTabs from "@/components/ContentTabs";
import NFLGameCard from "@/components/NFLGameCard";
import Leaderboard from "@/components/Leaderboard";
import { NFLWeek, NFLGame, UserPick } from "@/lib/types";
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

type Tab = "spreads" | "messageboard";
type SortOption = "spread" | "homeUnderdog" | "gameTime";

export default function Home() {
  const { user, isAuthenticated, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("spreads");
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("spread");

  // Default league ID - in a real app we would fetch the user's leagues
  const leagueId = 1;

  // Get the current NFL week
  const { data: currentWeek, isLoading: isLoadingWeek } = useQuery<NFLWeek>({
    queryKey: ["/api/nfl-weeks/current"],
  });

  // Get all underdog games for the week
  const { data: games, isLoading: isLoadingGames } = useQuery<NFLGame[]>({
    queryKey: ["/api/nfl-games/underdog", { weekId: currentWeek?.id }],
    enabled: !!currentWeek?.id,
  });

  // Get the user's pick for this week
  const { data: userPick, isLoading: isLoadingPick } = useQuery<UserPick | null>({
    queryKey: ["/api/user-pick", { weekId: currentWeek?.id, leagueId }],
    enabled: !!currentWeek?.id && isAuthenticated,
  });

  // Mutation for submitting a pick
  const { mutate: submitPick, isPending: isSubmittingPick } = useMutation({
    mutationFn: async (data: { gameId: number; pickedTeamId: number; leagueId: number; weekId: number }) => {
      return apiRequest("POST", "/api/user-pick", data);
    },
    onSuccess: () => {
      toast({
        title: "Pick submitted",
        description: "Your pick has been saved",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user-pick"] });
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
  const handleTeamSelection = (gameId: number, teamId: number) => {
    setSelectedGameId(gameId);
    setSelectedTeamId(teamId);
  };

  // Handle pick submission
  const handleSubmitPick = () => {
    if (!selectedGameId || !selectedTeamId || !currentWeek) {
      toast({
        title: "Error",
        description: "Please select a team",
        variant: "destructive",
      });
      return;
    }

    submitPick({
      gameId: selectedGameId,
      pickedTeamId: selectedTeamId,
      leagueId,
      weekId: currentWeek.id,
    });
  };

  // Check if user has a pick
  const hasSubmittedPick = !!userPick;

  // Initialize selection with user's current pick if it exists
  useState(() => {
    if (userPick) {
      setSelectedGameId(userPick.gameId);
      setSelectedTeamId(userPick.pickedTeamId);
    }
  });

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

  // Determine if picks are locked
  const arePicksLocked = currentWeek 
    ? new Date() >= new Date(currentWeek.picksLockAt) 
    : false;

  // Loading state
  const isLoading = isLoadingWeek || isLoadingGames || isLoadingPick || isLoadingAuth;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* League Header with countdown */}
      <LeagueHeader leagueId={leagueId} hasSubmittedPick={hasSubmittedPick} />

      {/* Content Tabs */}
      <ContentTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pick Selection */}
        {activeTab === "spreads" && (
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">
                    {currentWeek ? `Week ${currentWeek.weekNumber} Pick Selection` : "Pick Selection"}
                  </h3>
                  <div className="relative inline-block text-left">
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
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="mb-4">
                      <Skeleton className="h-24 w-full rounded-lg" />
                    </div>
                  ))
                ) : (
                  <>
                    {sortedGames && sortedGames.length > 0 ? (
                      <form id="pick-form" onSubmit={(e) => { e.preventDefault(); handleSubmitPick(); }}>
                        {sortedGames.map((game) => (
                          <NFLGameCard
                            key={game.id}
                            game={game}
                            selectedTeamId={userPick && game.id === userPick.gameId ? userPick.pickedTeamId : selectedTeamId}
                            onSelect={handleTeamSelection}
                            disabled={arePicksLocked || !isAuthenticated}
                          />
                        ))}
                        
                        {!isAuthenticated ? (
                          <div className="mt-6 bg-blue-50 p-4 rounded-md">
                            <p className="text-center text-blue-700">Please <a href="/api/login" className="font-bold underline">log in</a> to make your pick</p>
                          </div>
                        ) : arePicksLocked ? (
                          <div className="mt-6 bg-yellow-50 p-4 rounded-md">
                            <p className="text-center text-yellow-700">Picks are locked for this week</p>
                          </div>
                        ) : (
                          <div className="mt-6">
                            <Button 
                              type="submit" 
                              className="w-full" 
                              disabled={isSubmittingPick || !selectedTeamId}
                            >
                              {isSubmittingPick ? "Submitting..." : "Submit My Pick"}
                            </Button>
                          </div>
                        )}
                      </form>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No games available for this week
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "messageboard" && (
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Messageboard</h3>
              </div>
              <div className="px-6 py-12 text-center">
                <p className="text-gray-500">Messageboard feature coming soon!</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Leaderboard */}
        <div className="lg:col-span-1">
          <Leaderboard leagueId={leagueId} />
        </div>
      </div>
    </div>
  );
}
