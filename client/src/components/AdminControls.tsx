import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Lock, Unlock, UserCog, RefreshCw, Database, CheckCircle, Edit, Clock, Activity, Users, UserCheck, UserX } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { formatWeeklyDate } from "@/lib/formatDate";
import { NFLWeek, League, NFLGame, NFLTeam, User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Separator } from "@/components/ui/separator";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface GameResultsManagerProps {
  weekId: number;
}

const GameResultsManager = ({ weekId }: GameResultsManagerProps) => {
  const { toast } = useToast();
  const [editingGameId, setEditingGameId] = useState<number | null>(null);
  const [homeScore, setHomeScore] = useState<string>("");
  const [awayScore, setAwayScore] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Fetch games for this week
  const { data: games, isLoading, refetch } = useQuery<(NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam })[]>({
    queryKey: [`/api/nfl-games/week/${weekId}`],
  });
  
  const startEditing = (game: NFLGame & { homeTeam: NFLTeam, awayTeam: NFLTeam }) => {
    setEditingGameId(Number(game.id));
    setHomeScore(game.homeTeamScore?.toString() || "");
    setAwayScore(game.awayTeamScore?.toString() || "");
  };
  
  const cancelEditing = () => {
    setEditingGameId(null);
    setHomeScore("");
    setAwayScore("");
  };
  
  const saveGameResult = async (gameId: number) => {
    if (!homeScore.trim() || !awayScore.trim()) {
      toast({
        title: "Missing scores",
        description: "Please enter both home and away team scores",
        variant: "destructive"
      });
      return;
    }
    
    const homeScoreNum = parseInt(homeScore);
    const awayScoreNum = parseInt(awayScore);
    
    if (isNaN(homeScoreNum) || isNaN(awayScoreNum)) {
      toast({
        title: "Invalid scores",
        description: "Scores must be valid numbers",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/admin/games/${gameId}/update-result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          homeTeamScore: homeScoreNum,
          awayTeamScore: awayScoreNum,
          completed: true
        }),
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update game result: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Refetch games data to update UI
      await refetch();
      
      // Refetch leaderboard data since points will have changed
      queryClient.invalidateQueries({ queryKey: ["/api/league/1/leaderboard"] });
      
      toast({
        title: "Success",
        description: result.message || "Game result updated successfully",
        variant: "default"
      });
      
      // Reset state
      cancelEditing();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update game result",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (isLoading) {
    return <div className="text-center py-4">Loading games...</div>;
  }
  
  if (!games || games.length === 0) {
    return <div className="text-center py-4">No games found for this week.</div>;
  }
  
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Game</TableHead>
            <TableHead className="w-[120px]">Time</TableHead>
            <TableHead className="w-[120px]">Spread</TableHead>
            <TableHead className="w-[120px]">Home Score</TableHead>
            <TableHead className="w-[120px]">Away Score</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
            <TableHead className="w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {games.map(game => (
            <TableRow key={game.id}>
              <TableCell className="font-medium">
                {game.awayTeam.name} @ {game.homeTeam.name}
              </TableCell>
              <TableCell className="text-sm">
                {format(new Date(game.gameTime), "MMM d, h:mm a")}
              </TableCell>
              <TableCell>
                {parseFloat(game.spread.toString()) > 0 
                  ? `${game.homeTeam.abbreviation} +${game.spread}` 
                  : parseFloat(game.spread.toString()) < 0
                    ? `${game.awayTeam.abbreviation} ${-parseFloat(game.spread.toString())}`
                    : "Even"}
              </TableCell>
              <TableCell>
                {editingGameId === Number(game.id) ? (
                  <Input
                    type="number"
                    min="0"
                    value={homeScore}
                    onChange={e => setHomeScore(e.target.value)}
                    className="w-16"
                  />
                ) : (
                  game.homeTeamScore ?? "-"
                )}
              </TableCell>
              <TableCell>
                {editingGameId === Number(game.id) ? (
                  <Input
                    type="number"
                    min="0"
                    value={awayScore}
                    onChange={e => setAwayScore(e.target.value)}
                    className="w-16"
                  />
                ) : (
                  game.awayTeamScore ?? "-"
                )}
              </TableCell>
              <TableCell>
                {game.completed ? (
                  <Badge className="bg-green-500 hover:bg-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" /> Completed
                  </Badge>
                ) : (
                  <Badge variant="outline">Pending</Badge>
                )}
              </TableCell>
              <TableCell>
                {editingGameId === Number(game.id) ? (
                  <div className="flex space-x-2">
                    <Button 
                      size="sm" 
                      variant="default"
                      disabled={isSubmitting}
                      onClick={() => saveGameResult(Number(game.id))}
                    >
                      {isSubmitting ? "Saving..." : "Save"}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={cancelEditing}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startEditing(game)}
                    disabled={editingGameId !== null}
                  >
                    <Edit className="h-4 w-4 mr-1" /> 
                    {game.completed ? "Edit" : "Enter Score"}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

interface AdminControlsProps {
  leagueId: number;
}

export default function AdminControls({ leagueId }: AdminControlsProps) {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isLoadingScheduler, setIsLoadingScheduler] = useState(false);

  // Get current NFL week
  const { 
    data: currentWeek, 
    isLoading: isLoadingWeek,
    refetch: refetchWeek
  } = useQuery<NFLWeek>({
    queryKey: ["/api/nfl-weeks/current"],
  });

  // Get league info
  const { 
    data: league, 
    isLoading: isLoadingLeague 
  } = useQuery<League>({
    queryKey: [`/api/leagues/${leagueId}`],
  });

  // Get league members to check admin status
  const { 
    data: leagueMembers, 
    isLoading: isLoadingMembers 
  } = useQuery({
    queryKey: [`/api/leagues/${leagueId}/members`],
  });

  // Check if user is an admin for this league
  const isAdmin = user && leagueMembers && Array.isArray(leagueMembers) && 
    leagueMembers.some((member: any) => 
      member.userId === user.id && member.isAdmin
    );

  // Check if picks are locked
  const arePicksLocked = currentWeek ? new Date() > new Date(currentWeek.picksLockAt) : false;

  // Get scheduler status
  const { 
    data: schedulerStatus, 
    isLoading: isLoadingSchedulerStatus,
    refetch: refetchSchedulerStatus
  } = useQuery({
    queryKey: ["/api/admin/scheduler/status"],
    enabled: !!isAdmin,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const togglePickLockStatus = async () => {
    if (!currentWeek || !user) return;
    
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/admin/week/${currentWeek.id}/toggle-lock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          leagueId,
          locked: !arePicksLocked
        }),
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error(`Failed to toggle pick lock status: ${response.statusText}`);
      }
      
      const result = await response.json();

      // Refetch current week to update the UI
      await refetchWeek();
      
      toast({
        title: "Success",
        description: result.message,
        variant: "default"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update pick lock status",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };
  
  const pullNFLGamesFromAPI = async () => {
    if (!currentWeek || !user) return;
    
    setIsLoadingGames(true);
    try {
      const response = await fetch(`/api/admin/games/fetch-from-api`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          weekId: currentWeek.id
        }),
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error(`Failed to pull NFL games: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Refetch games data
      queryClient.invalidateQueries({ queryKey: [`/api/nfl-games/week/${currentWeek.id}`] });
      
      toast({
        title: "Success",
        description: result.message || `Successfully pulled ${result.games?.length || 0} NFL games for Week ${currentWeek.weekNumber}`,
        variant: "default"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to pull NFL games from API",
        variant: "destructive"
      });
    } finally {
      setIsLoadingGames(false);
    }
  };

  const pullNFLResultsFromAPI = async () => {
    if (!currentWeek || !user) return;
    
    setIsLoadingResults(true);
    try {
      const response = await fetch(`/api/admin/games/fetch-results`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          weekId: currentWeek.id
        }),
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error(`Failed to pull NFL results: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Refetch all related data
      queryClient.invalidateQueries({ queryKey: [`/api/nfl-games/week/${currentWeek.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/leaderboard`] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/week/${currentWeek.id}/picks`] });
      
      toast({
        title: "Success",
        description: result.message || `Successfully updated ${result.results?.gamesUpdated || 0} game results for Week ${currentWeek.weekNumber}`,
        variant: "default"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to pull NFL results from API",
        variant: "destructive"
      });
    } finally {
      setIsLoadingResults(false);
    }
  };

  const triggerManualSchedulerPull = async () => {
    if (!user) return;
    
    setIsLoadingScheduler(true);
    try {
      const response = await fetch("/api/admin/scheduler/manual-pull", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error(`Failed to trigger manual pull: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Refetch all related data
      queryClient.invalidateQueries({ queryKey: [`/api/nfl-games/week/${currentWeek?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/leaderboard`] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/week/${currentWeek?.id}/picks`] });
      refetchSchedulerStatus();
      
      toast({
        title: "Success",
        description: result.message || "Manual data pull completed successfully",
        variant: "default"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to trigger manual data pull",
        variant: "destructive"
      });
    } finally {
      setIsLoadingScheduler(false);
    }
  };

  const testScheduledJob = async () => {
    if (!user) return;
    
    setIsLoadingScheduler(true);
    try {
      const response = await fetch("/api/admin/scheduler/test-job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error(`Failed to test scheduled job: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Refetch all related data
      queryClient.invalidateQueries({ queryKey: [`/api/nfl-games/week/${currentWeek?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/leaderboard`] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/week/${currentWeek?.id}/picks`] });
      refetchSchedulerStatus();
      
      toast({
        title: "Success",
        description: result.message || "Scheduled job test completed successfully",
        variant: "default"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to test scheduled job",
        variant: "destructive"
      });
    } finally {
      setIsLoadingScheduler(false);
    }
  };

  const testResultsJob = async () => {
    if (!user) return;
    
    setIsLoadingScheduler(true);
    try {
      const response = await fetch("/api/admin/scheduler/test-results-job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error(`Failed to test results job: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Refetch all related data
      queryClient.invalidateQueries({ queryKey: [`/api/nfl-games/week/${currentWeek?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/leaderboard`] });
      queryClient.invalidateQueries({ queryKey: [`/api/league/${leagueId}/week/${currentWeek?.id}/picks`] });
      refetchSchedulerStatus();
      
      toast({
        title: "Success",
        description: result.message || "Results job test completed successfully",
        variant: "default"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to test results job",
        variant: "destructive"
      });
    } finally {
      setIsLoadingScheduler(false);
    }
  };

  if (isLoadingAuth || isLoadingWeek || isLoadingLeague || isLoadingMembers) {
    return null; // Don't show anything while loading
  }

  // Only show admin controls for admins
  if (!isAdmin) return null;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center">
          <UserCog className="h-5 w-5 mr-2 text-primary" />
          League Admin Controls
        </CardTitle>
        <CardDescription>
          Manage pick locks and other settings for Week {currentWeek?.weekNumber}
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {/* Lock/Unlock Picks Section */}
        <div className="mb-6">
          <div className="text-sm font-medium mb-2">Lock/Unlock Picks</div>
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 flex items-start">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              Toggling the pick lock status will affect all users in this league. 
              {arePicksLocked
                ? " Unlocking picks will allow users to change their selections."
                : " Locking picks will prevent users from making or changing their selections."}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
            <div className="mb-3 sm:mb-0">
              <div className="text-sm font-medium">
                Current status: 
                <span className={arePicksLocked ? " text-red-600" : " text-green-600"}>
                  {arePicksLocked ? " Picks are locked" : " Picks are unlocked"}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {currentWeek && `Week ${currentWeek.weekNumber}: ${formatWeeklyDate(currentWeek.startDate)} - ${formatWeeklyDate(currentWeek.endDate)}`}
              </div>
            </div>
            
            <Button
              variant={arePicksLocked ? "default" : "destructive"}
              size="sm"
              disabled={isUpdating}
              onClick={togglePickLockStatus}
              className="ml-auto"
            >
              {isUpdating ? "Updating..." : (
                arePicksLocked ? (
                  <><Unlock className="h-4 w-4 mr-2" /> Unlock Picks</>
                ) : (
                  <><Lock className="h-4 w-4 mr-2" /> Lock Picks</>
                )
              )}
            </Button>
          </div>
        </div>
        
        <Separator className="my-4" />
        
        {/* NFL Games Section */}
        <div className="mb-6">
          <div className="text-sm font-medium mb-2">Manage NFL Games</div>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4 flex items-start">
            <Database className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              This will populate this week's NFL games from The Odds API, using DraftKings spreads.
              Existing games will be updated with the latest odds data.
            </div>
          </div>
          
          <div className="flex justify-end">
            <Button
              variant="default"
              size="sm"
              disabled={isLoadingGames}
              onClick={pullNFLGamesFromAPI}
              className="ml-auto"
            >
              {isLoadingGames ? "Loading..." : (
                <><RefreshCw className="h-4 w-4 mr-2" /> Pull NFL Games from API</>
              )}
            </Button>
          </div>
        </div>
        
        <Separator className="my-4" />
        
        {/* Scheduler Status Section */}
        <div className="mb-6">
          <div className="text-sm font-medium mb-2">Automated Data Scheduler</div>
          <div className="bg-purple-50 border border-purple-200 rounded-md p-3 mb-4 flex items-start">
            <Clock className="h-5 w-5 text-purple-500 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-purple-800">
              The scheduler automatically pulls game data 12 hours before the first NFL game and results 5 hours after the last game of each week.
              You can check the status and manually trigger pulls if needed.
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4">
            <div className="mb-3 sm:mb-0">
              <div className="text-sm font-medium">
                Scheduler Status: 
                <span className={(schedulerStatus as any)?.isRunning ? " text-green-600" : " text-red-600"}>
                  {isLoadingSchedulerStatus ? " Loading..." : ((schedulerStatus as any)?.isRunning ? " Running" : " Stopped")}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {schedulerStatus && `${(schedulerStatus as any).jobCount || 0} scheduled job${(schedulerStatus as any).jobCount !== 1 ? 's' : ''}`}
              </div>
            </div>
            
            <div className="flex space-x-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                disabled={isLoadingScheduler}
                onClick={triggerManualSchedulerPull}
              >
                {isLoadingScheduler ? "Pulling..." : (
                  <><Activity className="h-4 w-4 mr-2" /> Manual Data Pull</>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isLoadingScheduler}
                onClick={testScheduledJob}
              >
                {isLoadingScheduler ? "Testing..." : (
                  <><Clock className="h-4 w-4 mr-2" /> Test Data Pull</>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isLoadingScheduler}
                onClick={testResultsJob}
              >
                {isLoadingScheduler ? "Testing..." : (
                  <><CheckCircle className="h-4 w-4 mr-2" /> Test Results Pull</>
                )}
              </Button>
            </div>
          </div>
        </div>
        
        <Separator className="my-4" />
        
        {/* Game Results Section */}
        <div>
          <div className="text-sm font-medium mb-2">Update Game Results</div>
          <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-4 flex items-start">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-green-800">
              Pull completed game results from ESPN API to automatically update scores and calculate user points.
              This will fetch final scores for all completed games and process winning picks.
            </div>
          </div>
          
          <div className="flex justify-end">
            <Button
              variant="default"
              size="sm"
              disabled={isLoadingResults}
              onClick={pullNFLResultsFromAPI}
              className="ml-auto"
            >
              {isLoadingResults ? "Loading..." : (
                <><Database className="h-4 w-4 mr-2" /> Pull Game Results from API</>
              )}
            </Button>
          </div>
        </div>
        
        <Separator className="my-6" />
        
        {/* User Management Section */}
        <UserManagement leagueId={leagueId} />
      </CardContent>
    </Card>
  );
}

// User Management Component
interface UserManagementProps {
  leagueId: number;
}

const UserManagement = ({ leagueId }: UserManagementProps) => {
  const { toast } = useToast();
  
  // Fetch all league members with user details
  const { data: leagueMembers, isLoading, refetch } = useQuery<any[]>({
    queryKey: [`/api/leagues/${leagueId}/members`],
  });

  // Mutation for toggling user activation status
  const toggleActivationMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return apiRequest("POST", `/api/admin/league/${leagueId}/member/${userId}/toggle-active`, {});
    },
    onSuccess: (data: any, variables) => {
      toast({
        title: "Success",
        description: data.message || `User ${data.isActive ? 'activated' : 'deactivated'} successfully`,
        variant: "default"
      });
      // Refetch league members to update the UI
      refetch();
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${leagueId}/members`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user status",
        variant: "destructive"
      });
    }
  });

  const handleToggleActivation = (userId: string, currentStatus: boolean) => {
    toggleActivationMutation.mutate({ userId, isActive: currentStatus });
  };

  if (isLoading) {
    return (
      <div>
        <div className="text-sm font-medium mb-4 flex items-center">
          <Users className="h-4 w-4 mr-2" />
          User Management
        </div>
        <div className="text-sm text-gray-500">Loading users...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-sm font-medium mb-4 flex items-center">
        <Users className="h-4 w-4 mr-2" />
        User Management
      </div>
      
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4 flex items-start">
        <UserCog className="h-5 w-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          Manage league member activation status. Inactive users cannot submit picks and will see a message to contact the admin.
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Admin</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leagueMembers?.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <div className="font-medium">{member.user?.username || member.user?.email}</div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {member.user?.email || 'No email'}
                </TableCell>
                <TableCell className="text-center">
                  <Badge 
                    variant={member.isActive ? "default" : "secondary"}
                    className={member.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                  >
                    {member.isActive ? (
                      <><UserCheck className="h-3 w-3 mr-1" /> Active</>
                    ) : (
                      <><UserX className="h-3 w-3 mr-1" /> Inactive</>
                    )}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {member.isAdmin && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      <UserCog className="h-3 w-3 mr-1" />
                      Admin
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={member.isActive ? "outline" : "default"}
                    onClick={() => handleToggleActivation(member.userId, member.isActive)}
                    disabled={toggleActivationMutation.isPending}
                    className={member.isActive ? 
                      "text-red-600 hover:text-red-700 hover:bg-red-50" : 
                      "bg-green-600 hover:bg-green-700"
                    }
                  >
                    {toggleActivationMutation.isPending ? (
                      "Updating..."
                    ) : member.isActive ? (
                      <><UserX className="h-3 w-3 mr-1" /> Deactivate</>
                    ) : (
                      <><UserCheck className="h-3 w-3 mr-1" /> Activate</>
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {leagueMembers?.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No league members found.
        </div>
      )}
    </div>
  );
};