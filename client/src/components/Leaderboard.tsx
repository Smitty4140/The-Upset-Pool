import { useQuery } from "@tanstack/react-query";
import { UserWithEligibility } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Medal, Calendar, CheckCircle, XCircle } from "lucide-react";

type LeaderboardProps = {
  leagueId: number;
};

export default function Leaderboard({ leagueId }: LeaderboardProps) {
  const { data: leaderboard, isLoading } = useQuery<UserWithEligibility[]>({
    queryKey: [`/api/league/${leagueId}/leaderboard`],
  });

  // Function to calculate proper rankings with ties
  const calculateRankings = (users: UserWithEligibility[]) => {
    if (!users || users.length === 0) return [];
    
    // Sort users by points (descending)
    const sortedUsers = [...users].sort((a, b) => {
      const aPoints = parseFloat(a.totalPoints || '0');
      const bPoints = parseFloat(b.totalPoints || '0');
      return bPoints - aPoints;
    });
    
    // Calculate rankings with proper tie handling
    const rankedUsers = [];
    let currentRank = 1;
    
    for (let i = 0; i < sortedUsers.length; i++) {
      const user = sortedUsers[i];
      const currentPoints = parseFloat(user.totalPoints || '0');
      
      // If this isn't the first user and points are different from previous user
      if (i > 0) {
        const previousPoints = parseFloat(sortedUsers[i - 1].totalPoints || '0');
        if (currentPoints !== previousPoints) {
          currentRank = i + 1; // Set rank to position + 1
        }
        // If points are the same, keep the same rank
      }
      
      rankedUsers.push({
        ...user,
        rank: currentRank
      });
    }
    
    return rankedUsers;
  };

  const rankedLeaderboard = leaderboard ? calculateRankings(leaderboard) : [];

  const formatDate = () => {
    const now = new Date();
    return now.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
        <div className="bg-gradient-to-r from-primary/20 to-secondary/20 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <Trophy className="h-5 w-5 text-accent mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Leaderboard</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">Loading...</p>
        </div>
        <div className="px-6 py-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center space-x-4 py-3">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-5 w-12" />
              <div className="flex items-center flex-1">
                <Skeleton className="h-8 w-8 rounded-full mr-2" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
      <div className="bg-gradient-to-r from-primary/20 to-secondary/20 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          <Trophy className="h-5 w-5 text-yellow-500 mr-2" />
          <h3 className="text-lg font-medium text-gray-900">Leaderboard</h3>
        </div>
        <div className="flex items-center text-sm text-gray-500 mt-1">
          <Calendar className="h-3.5 w-3.5 mr-1" />
          <span>As of {formatDate()}</span>
        </div>
      </div>
      <div className="px-4 py-3">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Place</th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Every Week Eligible</th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pooler</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rankedLeaderboard && rankedLeaderboard.length > 0 ? (
              rankedLeaderboard.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-3 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center">
                      {user.rank === 1 ? (
                        <Medal className="h-5 w-5 text-yellow-500 mr-1" />
                      ) : user.rank === 2 ? (
                        <Medal className="h-5 w-5 text-gray-400 mr-1" />
                      ) : user.rank === 3 ? (
                        <Medal className="h-5 w-5 text-amber-700 mr-1" />
                      ) : (
                        <span className="font-medium text-gray-700 mx-1">{user.rank}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap">
                    <div className="text-sm font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full inline-block">
                      {user.totalPoints || "0"} pts
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    {user.everyWeekEligible ? (
                      <div data-testid={`eligible-status-${user.id}`} className="flex items-center justify-center">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span className="ml-1 text-xs font-medium text-green-700">Yes</span>
                      </div>
                    ) : (
                      <div data-testid={`eligible-status-${user.id}`} className="flex items-center justify-center">
                        <XCircle className="h-5 w-5 text-red-600" />
                        <span className="ml-1 text-xs font-medium text-red-700">No</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-700">
                    <div className="flex items-center">
                      <Avatar className="h-7 w-7 mr-2 border border-gray-200">
                        <AvatarImage src={user.profileImageUrl ?? ""} alt={user.username ?? ""} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {user.username?.[0].toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.username}</span>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center">
                  <div className="flex flex-col items-center text-gray-500">
                    <Trophy className="h-10 w-10 text-gray-300 mb-2" />
                    <p className="font-medium">No entries yet</p>
                    <p className="text-xs mt-1">Make your pick to join the leaderboard!</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
