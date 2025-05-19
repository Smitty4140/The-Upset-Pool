import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Lock, Unlock, UserCog } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { formatWeeklyDate } from "@/lib/formatDate";
import { NFLWeek, League } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

type AdminControlsProps = {
  leagueId: number;
};

export default function AdminControls({ leagueId }: AdminControlsProps) {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);

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
      member.userId === user?.id && member.isAdmin
    );

  // Check if picks are locked
  const arePicksLocked = currentWeek ? new Date() > new Date(currentWeek.picksLockAt) : false;

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
        {/* Warning that this affects all users */}
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
      </CardContent>
    </Card>
  );
}