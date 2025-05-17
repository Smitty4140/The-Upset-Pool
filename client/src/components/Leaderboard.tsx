import { useQuery } from "@tanstack/react-query";
import { User } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type LeaderboardProps = {
  leagueId: number;
};

export default function Leaderboard({ leagueId }: LeaderboardProps) {
  const { data: leaderboard, isLoading } = useQuery<User[]>({
    queryKey: [`/api/league/${leagueId}/leaderboard`],
  });

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
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Leaderboard</h3>
          <p className="text-sm text-gray-500">Loading...</p>
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
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Leaderboard</h3>
        <p className="text-sm text-gray-500">As of {formatDate()}</p>
      </div>
      <div className="px-6 py-4">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Place</th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pooler</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {leaderboard && leaderboard.length > 0 ? (
              leaderboard.map((user, index) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{index + 1}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">{user.totalPoints}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <Avatar className="h-6 w-6 mr-2">
                        <AvatarImage src={user.profileImageUrl || ""} alt={user.username} />
                        <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span>{user.username}</span>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-sm text-gray-500">
                  No entries yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
