import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus, Loader2 } from "lucide-react";

const joinLeagueSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required").max(6, "Invite code must be 6 characters").toUpperCase(),
});

type JoinLeagueFormData = z.infer<typeof joinLeagueSchema>;

interface JoinLeagueProps {
  onLeagueJoined?: (league: any) => void;
}

export default function JoinLeague({ onLeagueJoined }: JoinLeagueProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<JoinLeagueFormData>({
    resolver: zodResolver(joinLeagueSchema),
    defaultValues: {
      inviteCode: "",
    },
  });

  const joinLeagueMutation = useMutation({
    mutationFn: async (data: JoinLeagueFormData) => {
      const response = await apiRequest("POST", "/api/leagues/join", data);
      return await response.json();
    },
    onSuccess: (result: any) => {
      toast({
        title: "League Joined!",
        description: result.message || `Successfully joined ${result.league?.name || 'league'}`,
      });
      
      // Reset form and close dialog
      form.reset();
      setOpen(false);
      
      // Refresh user leagues to show the new league
      queryClient.invalidateQueries({ queryKey: ["/api/user/leagues"] });
      
      // Call the callback if provided
      if (onLeagueJoined && result.league) {
        onLeagueJoined(result.league);
      }
    },
    onError: (error: any) => {
      console.error("Join league error:", error);
      let errorMessage = "Failed to join league";
      
      // Try to extract error message from the response
      if (error?.message) {
        // Check if it's a network error or a parsed error message
        if (error.message.includes(":")) {
          // Format: "400: Invalid invite code"
          const parts = error.message.split(":");
          if (parts.length > 1) {
            errorMessage = parts.slice(1).join(":").trim();
          }
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: JoinLeagueFormData) => {
    joinLeagueMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Join League
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Join a League</DialogTitle>
          <DialogDescription>
            Enter the invite code to join an existing league. You can get this code from a league admin.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="inviteCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invite Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ABC123"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      maxLength={6}
                      className="font-mono text-center text-lg tracking-wider"
                      style={{ textTransform: 'uppercase' }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="submit"
                disabled={joinLeagueMutation.isPending}
                className="w-full"
              >
                {joinLeagueMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Join League
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}