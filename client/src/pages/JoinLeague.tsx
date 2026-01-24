import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Users, Plus, Hash } from "lucide-react";

const joinLeagueSchema = z.object({
  inviteCode: z.string().min(1, "Please enter a league invite code"),
});

type JoinLeagueFormValues = z.infer<typeof joinLeagueSchema>;

export default function JoinLeague() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showCreateLeague, setShowCreateLeague] = useState(false);
  const [leagueName, setLeagueName] = useState("");

  const form = useForm<JoinLeagueFormValues>({
    resolver: zodResolver(joinLeagueSchema),
    defaultValues: {
      inviteCode: "",
    },
  });

  const joinLeagueMutation = useMutation({
    mutationFn: async (data: JoinLeagueFormValues) => {
      const response = await apiRequest('POST', '/api/leagues/join', { inviteCode: data.inviteCode });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Welcome to the league!",
        description: data.message || "You've successfully joined the league.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/leagues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation('/');
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to join league",
        description: error.message || "Please check the invite code and try again.",
        variant: "destructive",
      });
    },
  });

  const createLeagueMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest('POST', '/api/leagues', { name });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "League created!",
        description: `Your league "${data.name}" has been created. Invite code: ${data.inviteCode}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/leagues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation('/');
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create league",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Join a League</CardTitle>
          <CardDescription>
            Enter the invite code you received to join your league
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => joinLeagueMutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="inviteCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>League Invite Code</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Hash className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type="text"
                          placeholder="Enter invite code (e.g., ABC123)"
                          className="pl-10 uppercase"
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={joinLeagueMutation.isPending}
              >
                {joinLeagueMutation.isPending ? "Joining..." : "Join League"}
              </Button>
            </form>
          </Form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">
                Or
              </span>
            </div>
          </div>

          {!showCreateLeague ? (
            <Button
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
              onClick={() => setShowCreateLeague(true)}
            >
              <Plus className="h-4 w-4" />
              Create Your Own League
            </Button>
          ) : (
            <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
              <h3 className="font-medium text-sm">Create a New League</h3>
              <Input
                type="text"
                placeholder="Enter league name"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowCreateLeague(false);
                    setLeagueName("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={!leagueName.trim() || createLeagueMutation.isPending}
                  onClick={() => createLeagueMutation.mutate(leagueName.trim())}
                >
                  {createLeagueMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
