import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: typeof window !== 'undefined', // Only run in browser
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  return {
    user,
    isLoading: isLoading && typeof window !== 'undefined',
    isAuthenticated: !!user,
    error
  };
}
