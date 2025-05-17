import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";

export default function Header() {
  const [location] = useLocation();
  const { user, isLoading, isAuthenticated } = useAuth();
  
  // Fix for nested anchor issue - using custom rendering for links
  const NavLink = ({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) => {
    return (
      <Link href={href}>
        <span 
          className={`cursor-pointer text-gray-${active ? "900 font-medium border-b-2 border-primary" : "500 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300"} px-3 py-2`}
        >
          {children}
        </span>
      </Link>
    );
  };

  return (
    <header className="bg-gradient-to-r from-primary to-secondary text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <Shield className="h-8 w-8 text-accent mr-2" />
              <h1 className="text-2xl font-bold text-white">Upset Pool</h1>
            </div>
            <nav className="ml-6 flex space-x-8">
              <NavLink href="/" active={location === "/"}>
                My Leagues
              </NavLink>
              <NavLink href="/profile" active={location === "/profile"}>
                Profile
              </NavLink>
              <NavLink href="/rules" active={location === "/rules"}>
                Rules
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center">
            {isLoading ? (
              <Skeleton className="h-10 w-10 rounded-full" />
            ) : isAuthenticated ? (
              <div className="ml-3 relative flex items-center">
                <span className="mr-2 font-medium text-white">
                  {user?.username || "User"}
                </span>
                <Avatar className="h-10 w-10 border-2 border-white">
                  <AvatarImage src={user?.profileImageUrl || ""} alt={user?.username || "User"} />
                  <AvatarFallback className="bg-accent text-primary">{(user?.username || "U")[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
            ) : (
              <Button asChild variant="secondary" className="bg-white text-primary hover:bg-blue-50">
                <a href="/api/login">Log In</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
