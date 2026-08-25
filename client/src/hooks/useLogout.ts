import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type UseLogoutOptions = {
  /** Runs after the session is cleared, before the redirect back to "/". */
  onLoggedOut?: () => void;
};

/**
 * Signs the current user out and sends them back to the logged-out landing page.
 * Shared by the header account menu and by the dead-end screens (such as
 * "Join a League") that render without the header.
 */
export function useLogout({ onLoggedOut }: UseLogoutOptions = {}) {
  const { toast } = useToast();

  const { mutate: logout, isPending: isLoggingOut } = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to sign out");
      }
    },
    onSuccess: () => {
      queryClient.clear();
      onLoggedOut?.();
      window.location.assign("/");
    },
    onError: (error) => {
      toast({
        title: "Couldn't sign out",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  return { logout, isLoggingOut };
}
