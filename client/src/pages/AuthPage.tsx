import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Users, TrendingUp, Chrome } from "lucide-react";
import { useLocation } from "wouter";

export default function AuthPage() {
  const [, setLocation] = useLocation();

  const handleGoogleSignIn = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <Trophy className="h-16 w-16 text-blue-600" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            NFL Upset Pool
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Pick underdog teams to win each week and compete against friends. 
            The bigger the upset, the more points you earn!
          </p>
          
          <div className="flex flex-col gap-4 justify-center max-w-md mx-auto">
            {/* Primary Google Sign-In */}
            <Button 
              onClick={handleGoogleSignIn}
              size="lg" 
              className="flex items-center justify-center gap-2 w-full"
            >
              <Chrome className="h-5 w-5" />
              Continue with Google
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-blue-50 px-2 text-muted-foreground">
                  Or continue with email
                </span>
              </div>
            </div>

            {/* Email Options */}
            <div className="flex gap-2">
              <Button 
                onClick={() => setLocation('/login')} 
                variant="outline" 
                size="lg"
                className="flex-1"
              >
                Sign In
              </Button>
              <Button 
                onClick={() => setLocation('/register')} 
                variant="outline" 
                size="lg"
                className="flex-1"
              >
                Sign Up
              </Button>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <Trophy className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <CardTitle>Pick Underdogs</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Choose underdog teams each week. The bigger the spread, the more points you can earn when they win.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <Users className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <CardTitle>Compete with Friends</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Create or join leagues with friends and family. See who can pick the best upsets all season long.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <TrendingUp className="h-12 w-12 text-purple-600 mx-auto mb-4" />
              <CardTitle>Track Your Success</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Follow live leaderboards, track your picks, and see detailed statistics throughout the NFL season.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}