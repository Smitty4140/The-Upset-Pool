import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";

export default function AdminPage() {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [, setLocation] = useLocation();

  const { data: superUserStatus, isLoading: superUserLoading } = useQuery<{ isSuperUser: boolean }>({
    queryKey: ["/api/auth/super-user-status"],
  });

  const { data: currentWeek } = useQuery({
    queryKey: ["/api/nfl-weeks/current"],
    enabled: superUserStatus?.isSuperUser === true,
  });

  const syncGamesMutation = useMutation({
    mutationFn: async () => {
      setIsSyncing(true);
      const response = await fetch('/api/admin/pull-games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  if (superUserLoading) {
    return <div className="container mx-auto p-6 text-gray-500">Loading...</div>;
  }

  if (!superUserStatus?.isSuperUser) {
    return (
      <div className="container mx-auto p-6 text-center">
        <p className="text-gray-600 mb-4">You don't have access to this page.</p>
        <Button variant="outline" onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    );
  }

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
                Current Week: {currentWeek ? `Week ${(currentWeek as any).weekNumber}` : 'Loading...'}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Pull the latest NFL games from The Odds API and update the database.
              </p>
              <Button
                onClick={() => syncGamesMutation.mutate()}
                disabled={isSyncing || syncGamesMutation.isPending}
                className="w-full"
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
            <CardTitle>NFL Weeks Management</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Manage NFL weeks and their active status.
            </p>
            <p className="text-sm text-muted-foreground">
              This feature will be available soon.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
