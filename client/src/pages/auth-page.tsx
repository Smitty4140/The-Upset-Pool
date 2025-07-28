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
import { Trophy, Users, TrendingUp, Star, LogIn, UserPlus } from "lucide-react";

// Login form schema
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// Registration form schema
const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
  username: z.string().min(3, "Username must be at least 3 characters long"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");

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
              Pick underdog teams to win outright and earn points based on the spread. 
              Compete with friends in the ultimate NFL prediction challenge!
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 max-w-md mx-auto lg:mx-0">
            <div className="text-center space-y-2">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <Trophy className="h-8 w-8 text-yellow-500 mx-auto" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">Compete</div>
                <div className="text-sm text-gray-600">Weekly leaderboards</div>
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <TrendingUp className="h-8 w-8 text-green-500 mx-auto" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">Strategy</div>
                <div className="text-sm text-gray-600">Pick smart underdogs</div>
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <Users className="h-8 w-8 text-blue-500 mx-auto" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">Community</div>
                <div className="text-sm text-gray-600">Play with friends</div>
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <Star className="h-8 w-8 text-purple-500 mx-auto" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">Rewards</div>
                <div className="text-sm text-gray-600">Points for wins</div>
              </div>
            </div>
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
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Choose a username" 
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