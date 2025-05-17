import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { User } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export default function Profile() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-3xl mx-auto">
          <Skeleton className="h-12 w-64 mb-4" />
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4 mb-6">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div>
                  <Skeleton className="h-5 w-36 mb-2" />
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-4 w-5/6" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Profile</h1>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">Please log in to view your profile</p>
                <Button asChild variant="default">
                  <a href="/api/login">Log In</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Profile</h1>
        <Card>
          <CardHeader>
            <CardTitle>Your Account</CardTitle>
            <CardDescription>View and manage your upset pool account details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4 mb-6">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user?.profileImageUrl || ""} alt={user?.username || "User"} />
                <AvatarFallback className="text-lg">{user?.username ? user.username[0].toUpperCase() : "U"}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-medium">{user?.username}</h3>
                <p className="text-gray-500">{user?.email}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-sm text-gray-500 uppercase tracking-wider mb-1">Total Points</h4>
                <p className="text-2xl font-bold text-primary">{user?.totalPoints || "0"}</p>
              </div>
              
              <div className="mt-6 flex space-x-4">
                <Button asChild variant="outline">
                  <a href="/api/logout">Sign Out</a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
