import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Users, LogIn, UserPlus } from "lucide-react";

// Login form schema
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// Registration form schema
const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
  username: z.string().min(3, "Display name must be at least 3 characters long"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

// Google's own mark — the Chrome browser logo previously stood in for it,
// which misidentified the sign-in provider.
function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.64v3h3.86c2.26-2.09 3.56-5.17 3.56-8.88z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

interface AuthPageProps {
  authResult?: string | null;
}

export default function AuthPage({ authResult }: AuthPageProps) {
  const [, setLocation] = useLocation();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");

  // Handle OAuth results
  useEffect(() => {
    if (authResult === 'failed') {
      toast({
        title: "Login Failed",
        description: "Google login was cancelled or failed. Please try again.",
        variant: "destructive",
      });
      // Clean URL
      window.history.replaceState({}, '', '/');
    } else if (authResult === 'success') {
      toast({
        title: "Login Successful",
        description: "Welcome! You are now logged in.",
      });
      // Clean URL
      window.history.replaceState({}, '', '/');
    }
  }, [authResult, toast]);

  // Redirect if already logged in
  useEffect(() => {
    if (!isAuthLoading && user) {
      setLocation("/");
    }
  }, [user, isAuthLoading, setLocation]);

  // Login form
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Registration form
  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      username: "",
      firstName: "",
      lastName: "",
    },
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginFormData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${user.username}`,
      });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
  });

  // Registration mutation
  const registerMutation = useMutation({
    mutationFn: async (credentials: RegisterFormData) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      return await res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({
        title: "Welcome to NFL Upset Pool!",
        description: `Account created successfully for ${user.username}`,
      });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        title: "Registration failed",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const onLoginSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const onRegisterSubmit = (data: RegisterFormData) => {
    registerMutation.mutate(data);
  };

  const handleGoogleSignIn = () => {
    console.log('Starting Google OAuth flow...');
    // Use simple redirect - most reliable method
    window.location.href = '/api/auth/google';
  };

  // Don't render anything while checking auth status
  if (isAuthLoading) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Hero Section */}
        <div className="space-y-8 text-center lg:text-left">
          <div className="space-y-4">
            <h1 className="text-4xl lg:text-5xl font-bold text-gray-900">
              NFL Upset Pool
            </h1>
            <p className="text-xl text-gray-600 max-w-md mx-auto lg:mx-0">
              Pick one NFL underdog each week. When it wins outright, you score
              the points it was given. Simple to play, hard to win.
            </p>
          </div>

          {/* Three numbered steps, because this is the only page a new
              visitor sees before signing up — it has to teach the game. */}
          <div className="space-y-4 max-w-md mx-auto lg:mx-0 text-left">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              How it works
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm font-bold text-primary">
                1
              </div>
              <div>
                <div className="font-semibold text-gray-900">Pick one underdog a week</div>
                <div className="text-sm text-gray-600">
                  Choose a single team that oddsmakers expect to lose. Picks lock
                  at 1:00 PM ET Sunday, or at kickoff for earlier games.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm font-bold text-primary">
                2
              </div>
              <div>
                <div className="font-semibold text-gray-900">Win outright, score the spread</div>
                <div className="text-sm text-gray-600">
                  A +7.5 underdog that wins its game is worth 7.5 points. A loss
                  or a tie is worth nothing — covering the spread doesn&apos;t count.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm font-bold text-primary">
                3
              </div>
              <div>
                <div className="font-semibold text-gray-900">Most points wins the season</div>
                <div className="text-sm text-gray-600">
                  Points add up across the regular season. Pick every week to stay
                  eligible for the end-of-season prizes.
                </div>
              </div>
            </div>

            <p className="flex items-center gap-2 text-sm text-gray-500 pt-1">
              <Users className="h-4 w-4 flex-shrink-0" />
              Free to play. You&apos;ll need an invite code from your league to join.
            </p>
          </div>
        </div>

        {/* Auth Form Section */}
        <div className="w-full max-w-md mx-auto lg:max-w-lg">
          <Card className="border-0 shadow-xl">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl">Join NFL Upset Pool</CardTitle>
              <CardDescription>
                Sign in to your account or create a new one to get started
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login" className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger value="register" className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Sign Up
                  </TabsTrigger>
                </TabsList>

                {/* Google Sign-In Button - appears on both tabs */}
                <div className="space-y-4 mb-6">
                  <Button
                    onClick={handleGoogleSignIn}
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2 hover:bg-gray-50"
                    size="lg"
                  >
                    <GoogleMark />
                    Continue with Google
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-muted-foreground">
                        Or continue with email
                      </span>
                    </div>
                  </div>
                </div>

                <TabsContent value="login" className="space-y-4">
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="your-email@example.com" 
                                type="email"
                                autoComplete="email"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter your password" 
                                type="password"
                                autoComplete="current-password"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? "Signing in..." : "Sign In"}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="register" className="space-y-4">
                  <Form {...registerForm}>
                    <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                      <FormField
                        control={registerForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="your-email@example.com" 
                                type="email"
                                autoComplete="email"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={registerForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Display name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Shown on the leaderboard" 
                                autoComplete="username"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={registerForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Create a password (min 6 characters)" 
                                type="password"
                                autoComplete="new-password"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={registerForm.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name (Optional)</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="First name" 
                                  autoComplete="given-name"
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={registerForm.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last Name (Optional)</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Last name" 
                                  autoComplete="family-name"
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={registerMutation.isPending}
                      >
                        {registerMutation.isPending ? "Creating account..." : "Create Account"}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}