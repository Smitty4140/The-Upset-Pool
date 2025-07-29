import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { NFLGame } from "@/lib/types";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, Clock, CheckCircle } from "lucide-react";

interface GameResultsProps {
  weekId?: number;
}

export default function GameResults({ weekId }: GameResultsProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Get games for the current week
  const { data: games, isLoading: isLoadingGames, refetch: refetchGames } = useQuery<NFLGame[]>({
    queryKey: [`/api/nfl-games/week/${weekId}`],
    enabled: !!weekId,
  });

  // Set game result mutation
  const setResultMutation = useMutation({
    mutationFn: async ({ gameId, winningTeamId }: { gameId: number; winningTeamId: number }) => {
      return apiRequest("POST", `/api/games/${gameId}/result`, { winningTeamId });
    },
    onSuccess: (data, variables) => {
      const game = games?.find(g => Number(g.id) === variables.gameId);
      const winningTeam = game?.homeTeamId === variables.winningTeamId ? game.homeTeam : game?.awayTeam;
      
      toast({
        title: "Game Result Updated",
        description: `${winningTeam?.name} has been set as the winner. User points have been recalculated.`,
      });
      
      // Refetch games to update the UI immediately
      refetchGames();
      
      // Also invalidate the leaderboard to reflect updated points
      queryClient.invalidateQueries({ queryKey: [`/api/league/1/leaderboard`] });
      
      // Invalidate all related queries for good measure
      queryClient.invalidateQueries({ queryKey: [`/api/nfl-games`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to set game result",
        variant: "destructive",
      });
    },
  });

  const handleSetResult = (gameId: number, winningTeamId: number) => {
    setResultMutation.mutate({ gameId, winningTeamId });
  };

  if (isLoadingGames) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg">Loading games...</span>
      </div>
    );
  }

  if (!games || games.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Trophy className="h-5 w-5 mr-2" />
            Game Results
          </CardTitle>
          <CardDescription>Set game winners to calculate user points</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">No games available for this week</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Trophy className="h-5 w-5 mr-2" />
          Game Results
        </CardTitle>
        <CardDescription>
          Set the winning team for each game to calculate user points. This will automatically update all user picks and point totals.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {games.map((game) => (
            <div
              key={game.id}
              className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="text-sm text-gray-500 mb-2">
                    {new Date(game.gameTime).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short', 
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZoneName: 'short'
                    })}
                  </div>
                  
                  {/* Teams */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <img 
                          src={game.awayTeam.logoUrl} 
                          alt={game.awayTeam.name}
                          className="w-8 h-8 mr-3"
                        />
                        <div>
                          <div className="font-medium">{game.awayTeam.name}</div>
                          <div className="text-sm text-gray-500">Away</div>
                        </div>
                        {Number(game.spread) < 0 && (
                          <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800">
                            Underdog ({game.spread})
                          </Badge>
                        )}
                      </div>
                      {game.winningTeamId === game.awayTeamId && (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <img 
                          src={game.homeTeam.logoUrl} 
                          alt={game.homeTeam.name}
                          className="w-8 h-8 mr-3"
                        />
                        <div>
                          <div className="font-medium">{game.homeTeam.name}</div>
                          <div className="text-sm text-gray-500">Home</div>
                        </div>
                        {Number(game.spread) > 0 && (
                          <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800">
                            Underdog (+{game.spread})
                          </Badge>
                        )}
                      </div>
                      {game.winningTeamId === game.homeTeamId && (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Action buttons */}
                <div className="flex flex-col space-y-2 ml-4">
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      variant={game.winningTeamId === game.awayTeamId ? "default" : "outline"}
                      disabled={setResultMutation.isPending}
                      onClick={() => handleSetResult(Number(game.id), game.awayTeamId)}
                      className={`w-full ${game.winningTeamId === game.awayTeamId ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                    >
                      {setResultMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          {game.winningTeamId === game.awayTeamId && <CheckCircle className="h-4 w-4 mr-1" />}
                          {`${game.awayTeam.abbreviation} Wins`}
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant={game.winningTeamId === game.homeTeamId ? "default" : "outline"}
                      disabled={setResultMutation.isPending}
                      onClick={() => handleSetResult(Number(game.id), game.homeTeamId)}
                      className={`w-full ${game.winningTeamId === game.homeTeamId ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                    >
                      {setResultMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          {game.winningTeamId === game.homeTeamId && <CheckCircle className="h-4 w-4 mr-1" />}
                          {`${game.homeTeam.abbreviation} Wins`}
                        </>
                      )}
                    </Button>
                  </div>
                  
                  {game.winningTeamId && (
                    <div className="text-center mt-2">
                      <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                        Current Winner: {game.winningTeamId === game.homeTeamId ? game.homeTeam.abbreviation : game.awayTeam.abbreviation}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
              
              {game.winningTeamId && (
                <div className="mt-4 p-3 bg-green-50 rounded-md border border-green-200">
                  <div className="text-sm text-green-800">
                    <strong>Result Set:</strong> Points have been calculated for all user picks. You can change the winner anytime to recalculate points.
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}