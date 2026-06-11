import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Profile from "@/pages/Profile";
import Rules from "@/pages/Rules";
import AdminDashboard from "@/pages/Admin";
import Welcome from "@/pages/Welcome";
import AuthPage from "@/pages/auth-page";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import SetupUsername from "@/pages/SetupUsername";
import JoinLeague from "@/pages/JoinLeague";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";

function Router() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  
  // Fetch user's leagues
  const { data: userLeagues, isLoading: isLoadingLeagues } = useQuery<any[]>({
    queryKey: ["/api/user/leagues"],
    enabled: !!user && !!user.username,
  });
  
  // For callback path, show loading
  if (location.includes('/api/callback')) {
    return <div className="flex h-screen w-screen items-center justify-center">Processing login...</div>;
  }
  
  // Check for OAuth success/failure in URL params
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const authResult = urlParams.get('auth');
  
  // Show auth pages for non-authenticated users
  if (!user && !isLoading) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route>
          <AuthPage authResult={authResult} />
        </Route>
      </Switch>
    );
  }

  // Show loading state
  if (isLoading) {
    return <div className="flex h-screen w-screen items-center justify-center">Loading...</div>;
  }
  
  // Check if user needs to set username
  if (user && !user.username) {
    return <SetupUsername />;
  }
  
  // Show loading while checking leagues
  if (isLoadingLeagues) {
    return <div className="flex h-screen w-screen items-center justify-center">Loading...</div>;
  }
  
  // Check if user needs to join a league
  if (user && user.username && (!userLeagues || userLeagues.length === 0)) {
    return <JoinLeague />;
  }
  
  // If user is logged in, has username, and is in a league, show regular app layout
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow">
        <Switch>
          <Route path="/" component={Home} />
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
