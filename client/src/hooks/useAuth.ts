import { useQuery } from "@tanstack/react-query";
import type { User } from "@/lib/types";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
    refetchInterval: false
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error
  };
}
