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
  
  // If auth is loading, show loading indicator
  if (isLoading) {
    return <div className="flex h-screen w-screen items-center justify-center">Loading...</div>;
  }
  
  // For callback path, show loading
  if (location.includes('/api/callback')) {
    return <div className="flex h-screen w-screen items-center justify-center">Processing login...</div>;
  }
  
  // Show welcome page for non-authenticated users
  if (!user) {
    return <Welcome />;
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
