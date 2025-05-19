import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Profile from "@/pages/Profile";
import Rules from "@/pages/Rules";
import LeaderboardPage from "@/pages/Leaderboard";
import AdminDashboard from "@/pages/Admin";
import Welcome from "@/pages/Welcome";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";

function Router() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  
  // For callback path, show loading
  if (location.includes('/api/callback')) {
    return <div className="flex h-screen w-screen items-center justify-center">Processing login...</div>;
  }
  
  // Simple welcome page for non-authenticated users
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-900 to-blue-600 text-white">
        <div className="container mx-auto px-4 py-16 flex flex-col items-center">
          <h1 className="text-4xl md:text-6xl font-bold text-center mb-8">NFL Upset Pool</h1>
          <p className="text-xl md:text-2xl text-center mb-12 max-w-2xl">
            Pick underdog teams to win each week and earn points equal to the spread.
            Join now to compete against friends and family throughout the NFL season!
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 max-w-4xl">
            <div className="bg-white/10 p-6 rounded-lg backdrop-blur">
              <h2 className="text-2xl font-bold mb-4">How It Works</h2>
              <ul className="space-y-2">
                <li>• Select one underdog team each week</li>
                <li>• If they win, you earn points equal to the spread</li>
                <li>• Picks lock at 1 PM EST on Sundays</li>
                <li>• Person with the most points at the end wins!</li>
              </ul>
            </div>
            
            <div className="bg-white/10 p-6 rounded-lg backdrop-blur">
              <h2 className="text-2xl font-bold mb-4">Features</h2>
              <ul className="space-y-2">
                <li>• Real-time odds from DraftKings</li>
                <li>• Weekly leaderboard updates</li>
                <li>• Clean, mobile-friendly interface</li>
                <li>• Full NFL regular season coverage</li>
              </ul>
            </div>
          </div>
          
          <a 
            href="/api/login" 
            className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xl transition-colors"
          >
            Sign In / Sign Up
          </a>
        </div>
      </div>
    );
  }
  
  // If user is logged in, show regular app layout
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/leaderboard" component={LeaderboardPage} />
          <Route path="/profile" component={Profile} />
          <Route path="/rules" component={Rules} />
          <Route path="/admin" component={AdminDashboard} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
