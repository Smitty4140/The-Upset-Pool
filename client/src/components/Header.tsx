import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Header() {
  const [location] = useLocation();
  const { user, isLoading, isAuthenticated } = useAuth();

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <h1 className="text-2xl font-bold text-primary">Upset Pool</h1>
            </div>
            <nav className="ml-6 flex space-x-8">
              <Link href="/">
                <a className={`text-gray-${location === "/" ? "900 font-medium border-b-2 border-primary" : "500 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300"} px-3 py-2`}>
                  My Leagues
                </a>
              </Link>
              <Link href="/profile">
                <a className={`text-gray-${location === "/profile" ? "900 font-medium border-b-2 border-primary" : "500 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300"} px-3 py-2`}>
                  Profile
                </a>
              </Link>
              <Link href="/rules">
                <a className={`text-gray-${location === "/rules" ? "900 font-medium border-b-2 border-primary" : "500 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300"} px-3 py-2`}>
                  Rules
                </a>
              </Link>
            </nav>
          </div>
          <div className="flex items-center">
            {isLoading ? (
              <Skeleton className="h-10 w-10 rounded-full" />
            ) : isAuthenticated ? (
              <div className="ml-3 relative">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user?.profileImageUrl || ""} alt={user?.username || "User"} />
                  <AvatarFallback>{(user?.username || "U")[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
            ) : (
              <Button asChild variant="outline">
                <a href="/api/login">Log In</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
