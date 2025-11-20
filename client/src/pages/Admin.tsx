import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Clock } from "lucide-react";

export default function AdminPage() {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Current NFL week
  const { data: currentWeek } = useQuery({
    queryKey: ["/api/nfl-weeks/current"],
  });
  
  // API for syncing games
  const syncGamesMutation = useMutation({
    mutationFn: async () => {
      setIsSyncing(true);
      const response = await fetch('/api/admin/pull-games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to sync games');
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Games Synced Successfully",
        description: `Found ${data.results.gamesFound} games, created ${data.results.gamesCreated}, updated ${data.results.gamesUpdated}`,
      });
      setIsSyncing(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error Syncing Games",
        description: error.message,
        variant: "destructive",
      });
      setIsSyncing(false);
    },
  });
  
  // Function to handle sync button click
  const handleSyncGames = () => {
    syncGamesMutation.mutate();
  };

  // Test cron execution mutation
  const testCronMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/scheduler/test-cron', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to test cron execution');
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Cron Test Scheduled",
        description: `Test job will fire in ~2 minutes at ${data.expectedExecutionTime}. Watch the logs for confirmation.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Testing Cron",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>NFL Games Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">
                Current Week: {currentWeek ? `Week ${currentWeek.weekNumber}` : 'Loading...'}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Pull the latest NFL games from The Odds API and update the database.
              </p>
              <Button 
                onClick={handleSyncGames} 
                disabled={isSyncing || syncGamesMutation.isPending}
                className="w-full"
                data-testid="button-sync-games"
              >
                {isSyncing || syncGamesMutation.isPending ? 'Syncing...' : 'Pull NFL Games from API'}
              </Button>
            </div>
            
            {syncGamesMutation.data && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <h3 className="font-medium text-green-800">Sync Results:</h3>
                <ul className="list-disc pl-5 mt-2 text-sm text-green-700">
                  <li>Games Found: {syncGamesMutation.data.results.gamesFound}</li>
                  <li>Games Created: {syncGamesMutation.data.results.gamesCreated}</li>
                  <li>Games Updated: {syncGamesMutation.data.results.gamesUpdated}</li>
                  <li>Errors: {syncGamesMutation.data.results.errors}</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Scheduler Testing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Test that automated cron jobs execute correctly.
            </p>
            <div className="flex items-center mb-4">
              <Clock className="h-5 w-5 mr-2 text-blue-600" />
              <p className="text-sm">
                This will schedule a test job to run in 2 minutes. Check the server logs for execution confirmation.
              </p>
            </div>
            <Button 
              onClick={() => testCronMutation.mutate()}
              disabled={testCronMutation.isPending}
              className="w-full"
              data-testid="button-test-cron"
            >
              {testCronMutation.isPending ? 'Scheduling...' : 'Test Cron Execution (2 min)'}
            </Button>
            
            {testCronMutation.data && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <h3 className="font-medium text-blue-800">Test Scheduled:</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Job will execute at: {testCronMutation.data.expectedExecutionTime}
                </p>
                <p className="text-sm text-blue-600 mt-2">
                  Watch the server logs in ~2 minutes for "✅✅✅ TEST CRON JOB EXECUTED SUCCESSFULLY"
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}