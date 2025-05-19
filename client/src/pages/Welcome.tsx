import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FaTrophy, FaFootballBall, FaChartLine, FaUsers } from "react-icons/fa";
import { ArrowRight, CalendarDays, TrendingUp, Award, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Welcome() {
  const { user, isLoading } = useAuth();
  const [_, navigate] = useLocation();
  
  // Redirect to home if already logged in
  useEffect(() => {
    if (user && !isLoading) {
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-slate-50">
      {/* Hero Section */}
      <section className="relative px-4 pt-16 pb-12 sm:px-6 sm:pt-24 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="lg:grid lg:grid-cols-12 lg:gap-8">
            <div className="sm:text-center md:max-w-2xl md:mx-auto lg:col-span-6 lg:text-left">
              <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl">
                <span className="block">NFL</span>
                <span className="block text-primary">Upset Pool</span>
              </h1>
              <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
                Test your NFL knowledge by picking underdogs to win outright each week. 
                Earn points equal to the spread when your selected team wins.
              </p>
              <div className="mt-8 sm:max-w-lg sm:mx-auto sm:text-center lg:text-left lg:mx-0">
                <div className="space-y-4 sm:space-y-0 sm:flex sm:justify-center lg:justify-start sm:space-x-4">
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <a href="/api/login" className="flex items-center justify-center">
                      Sign Up Now
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-12 relative sm:max-w-lg sm:mx-auto lg:mt-0 lg:max-w-none lg:mx-0 lg:col-span-6 lg:flex lg:items-center">
              <div className="relative mx-auto w-full rounded-lg shadow-lg lg:max-w-md overflow-hidden">
                <img
                  className="w-full h-auto object-cover"
                  src="https://img.freepik.com/free-vector/american-football-background-with-trophy_23-2147654095.jpg"
                  alt="NFL Upset Pool"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Rules Section */}
      <section className="py-12 bg-slate-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              How It Works
            </h2>
            <p className="mt-3 max-w-2xl mx-auto text-xl text-gray-500 sm:mt-4">
              Simple rules, exciting gameplay, big rewards
            </p>
          </div>
          
          <div className="mt-10">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center mb-4">
                    <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-white">
                      <CalendarDays className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-medium">Weekly Selections</h3>
                  </div>
                  <p>Select one underdog team each week to win outright. Picks lock at 1 PM EST on Sundays.</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center mb-4">
                    <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-white">
                      <TrendingUp className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-medium">Scoring</h3>
                  </div>
                  <p>If your selected underdog wins, you earn points equal to the point spread. No points for losses.</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center mb-4">
                    <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-500 text-white">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-medium">Underdogs Only</h3>
                  </div>
                  <p>You can only select teams with a positive point spread (the team not favored to win).</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center mb-4">
                    <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-white">
                      <Award className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-medium">Winning</h3>
                  </div>
                  <p>The player with the most total points at the end of the NFL regular season wins the pool!</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="py-12 bg-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Why Join Our Upset Pool?
            </h2>
            <p className="mt-3 max-w-2xl mx-auto text-xl text-gray-500 sm:mt-4">
              Experience the excitement of NFL season in a whole new way
            </p>
          </div>
          
          <div className="mt-10">
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              <div className="text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white mx-auto">
                  <FaFootballBall className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">NFL Action</h3>
                <p className="mt-2 text-base text-gray-500">
                  Makes every game more exciting, not just your hometown team
                </p>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white mx-auto">
                  <FaChartLine className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Live Odds</h3>
                <p className="mt-2 text-base text-gray-500">
                  Real-time betting lines from DraftKings updated throughout the week
                </p>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white mx-auto">
                  <FaUsers className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Community</h3>
                <p className="mt-2 text-base text-gray-500">
                  Compete against friends, family, and colleagues throughout the season
                </p>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white mx-auto">
                  <FaTrophy className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Leaderboard</h3>
                <p className="mt-2 text-base text-gray-500">
                  Track your performance on our dynamic weekly leaderboard
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="bg-primary">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 lg:py-16">
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
            <div>
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                Ready to join the action?
              </h2>
              <p className="mt-3 max-w-3xl text-lg text-primary-foreground">
                Sign up now to join our NFL Upset Pool. It's free to play and you'll be automatically enrolled in this season's pool.
              </p>
              <div className="mt-8">
                <div className="inline-flex rounded-md shadow">
                  <Button asChild size="lg" variant="secondary">
                    <a href="/api/login" className="flex items-center justify-center">
                      Sign In / Sign Up
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-8 lg:mt-0">
              <div className="bg-white rounded-lg shadow-xl overflow-hidden">
                <div className="px-6 py-8 bg-white sm:p-10 sm:pb-6">
                  <div className="flex items-center">
                    <h3 className="inline-flex px-4 py-1 rounded-full text-sm font-semibold tracking-wide uppercase bg-indigo-100 text-indigo-600">
                      Season 2025
                    </h3>
                  </div>
                  <div className="mt-4 text-lg text-gray-900">Join our NFL Upset Pool</div>
                  <div className="mt-1"><span className="text-4xl font-extrabold text-gray-900">Free</span></div>
                </div>
                <div className="px-6 pt-6 pb-8 sm:p-10 sm:pt-6">
                  <ul className="space-y-3">
                    {[
                      'Full NFL regular season coverage',
                      'Weekly underdog picks',
                      'Live leaderboard updates',
                      'Mobile-friendly interface',
                      'Automatic enrollment'
                    ].map((feature, i) => (
                      <li key={i} className="flex items-start">
                        <div className="flex-shrink-0">
                          <svg className="h-6 w-6 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="ml-3 text-base text-gray-700">{feature}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="bg-gray-900">
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 md:flex md:items-center md:justify-between lg:px-8">
          <div className="mt-8 md:mt-0 md:order-1">
            <p className="text-center text-base text-gray-400">
              &copy; {new Date().getFullYear()} NFL Upset Pool. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}