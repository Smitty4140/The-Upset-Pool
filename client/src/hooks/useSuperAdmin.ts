import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

/**
 * Site-wide super admin status. Distinct from league admin, which is read
 * from the caller's membership row in a specific league.
 */
export function useSuperAdmin() {
  const { data, isLoading } = useQuery<{ isSuperUser: boolean } | null>({
    queryKey: ["/api/auth/super-user-status"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 60 * 1000,
  });

  return {
    isSuperAdmin: Boolean(data?.isSuperUser),
    isLoading,
  };
}
