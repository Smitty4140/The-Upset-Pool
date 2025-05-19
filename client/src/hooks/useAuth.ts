import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
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
