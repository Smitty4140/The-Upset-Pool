import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Menu, X } from "lucide-react";

export default function Header() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, isLoading, isAuthenticated } = useAuth();

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);
  
  // Fix for nested anchor issue - using custom rendering for links
  const NavLink = ({ href, active, children, mobile = false }: { href: string; active: boolean; children: React.ReactNode; mobile?: boolean }) => {
    const handleClick = () => {
      if (mobile) {
        setIsMobileMenuOpen(false);
      }
    };

    return (
      <Link href={href}>
        <span 
          className={`cursor-pointer ${
            mobile 
              ? `block px-3 py-2 rounded-md text-base font-medium ${active ? "bg-gray-900 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"}`
              : `${active ? "text-white font-medium border-b-2 border-accent" : "text-gray-300 hover:text-white border-b-2 border-transparent hover:border-gray-300"} px-3 py-2`
          }`}
          onClick={handleClick}
        >
          {children}
        </span>
      </Link>
    );
  };

  return (
    <header className="bg-gray-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Brand */}
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <a 
                href="https://playminigames.net/game/snood"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center cursor-pointer"
              >
                <Shield className="h-8 w-8 text-accent mr-2" />
                <h1 className="text-2xl font-bold text-white hover:text-gray-200 transition-colors">Upset Pool</h1>
              </a>
            </div>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:ml-6 md:flex md:space-x-8">
              <NavLink href="/" active={location === "/"}>
                My Leagues
              </NavLink>
              <NavLink href="/leaderboard" active={location === "/leaderboard"}>
                Leaderboard
              </NavLink>
              <NavLink href="/profile" active={location === "/profile"}>
                Profile
              </NavLink>
              <NavLink href="/rules" active={location === "/rules"}>
                Rules
              </NavLink>
              {user?.id === "42820911" && (
                <NavLink href="/admin" active={location === "/admin"}>
                  Admin
                </NavLink>
              )}
            </nav>
          </div>

          {/* Desktop User Profile */}
          <div className="hidden md:flex md:items-center md:space-x-4">
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

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              aria-expanded={isMobileMenuOpen}
            >
              <span className="sr-only">Open main menu</span>
              {isMobileMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-gray-700">
              <NavLink href="/" active={location === "/"} mobile>
                My Leagues
              </NavLink>
              <NavLink href="/leaderboard" active={location === "/leaderboard"} mobile>
                Leaderboard
              </NavLink>
              <NavLink href="/profile" active={location === "/profile"} mobile>
                Profile
              </NavLink>
              <NavLink href="/rules" active={location === "/rules"} mobile>
                Rules
              </NavLink>
              {user?.id === "42820911" && (
                <NavLink href="/admin" active={location === "/admin"} mobile>
                  Admin
                </NavLink>
              )}
            </div>
            
            {/* Mobile user section */}
            <div className="pt-4 pb-3 border-t border-gray-700">
              {isLoading ? (
                <div className="flex items-center px-5">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="ml-3 h-4 w-24" />
                </div>
              ) : isAuthenticated ? (
                <div className="flex items-center px-5">
                  <Avatar className="h-10 w-10 border-2 border-white">
                    <AvatarImage src={user?.profileImageUrl || ""} alt={user?.username || "User"} />
                    <AvatarFallback className="bg-accent text-primary">{(user?.username || "U")[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="ml-3">
                    <div className="text-base font-medium text-white">{user?.username || "User"}</div>
                    <div className="text-sm font-medium text-gray-400">{user?.email || ""}</div>
                  </div>
                </div>
              ) : (
                <div className="px-5">
                  <Button asChild variant="secondary" className="w-full bg-white text-primary hover:bg-blue-50">
                    <a href="/api/login">Log In</a>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
