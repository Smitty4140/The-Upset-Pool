import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Trophy } from "lucide-react";

// Username setup form schema
const usernameSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters long")
    .max(25, "Username must be less than 25 characters")
    .regex(/^[a-zA-Z0-9_\-\s]+$/, "Username can only contain letters, numbers, spaces, hyphens, and underscores")
    .refine(name => name.trim().length > 0, "Username cannot be only spaces")
});

type UsernameFormData = z.infer<typeof usernameSchema>;

export default function SetupUsername() {
  const [, setLocation] = useLocation();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Redirect if not logged in or already has username
  useEffect(() => {
    if (!isAuthLoading) {
      if (!user) {
        setLocation("/");
      } else if (user.username) {
        setLocation("/");
      }
    }
  }, [user, isAuthLoading, setLocation]);

  // Username setup form
  const form = useForm<UsernameFormData>({
    resolver: zodResolver(usernameSchema),
    defaultValues: {
      username: "",
    },
  });

  // Username setup mutation
  const setupUsernameMutation = useMutation({
    mutationFn: async (data: UsernameFormData) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", {
        username: data.username
      });
      return await res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
      toast({
        title: "Welcome to NFL Upset Pool!",
        description: `Your leaderboard name "${updatedUser.username}" has been set successfully.`,
      });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        title: "Setup failed",
        description: error.message || "This username is already taken. Please try another.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: UsernameFormData) => {
    // Trim whitespace from username before submitting
    setupUsernameMutation.mutate({
      username: data.username.trim()
    });
  };

  // Don't render anything while checking auth status
  if (isAuthLoading || !user) {
    return null;
  }

  // Don't show if user already has username
  if (user.username) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-6 h-6 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Choose Your Leaderboard Name</CardTitle>
            <CardDescription>
              This name will appear on leaderboards and be visible to other league members
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Leaderboard Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter your display name" 
                          autoComplete="username"
                          autoFocus
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-sm text-gray-600">
                        3-25 characters, letters, numbers, spaces, hyphens, and underscores
                      </p>
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={setupUsernameMutation.isPending}
                >
                  {setupUsernameMutation.isPending ? "Setting up..." : "Complete Setup"}
                </Button>
              </form>
            </Form>

            {user.firstName && (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600 text-center">
                  Welcome, {user.firstName}! 👋
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}