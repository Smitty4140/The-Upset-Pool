import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus, Loader2 } from "lucide-react";
import { League } from "@/lib/types";
import { nicknameSchema } from "@/lib/nicknameSchema";

const joinLeagueSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required").max(6, "Invite code must be 6 characters").toUpperCase(),
  nickname: nicknameSchema,
});

type JoinLeagueFormData = z.infer<typeof joinLeagueSchema>;

interface JoinLeagueProps {
  onLeagueJoined?: (league: League) => void;
}

export default function JoinLeague({ onLeagueJoined }: JoinLeagueProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<JoinLeagueFormData>({
    resolver: zodResolver(joinLeagueSchema),
    defaultValues: {
      inviteCode: "",
      nickname: "",
    },
  });

  // Prefill nickname with global username once user data is available
  useEffect(() => {
    if (user?.username && !form.getValues("nickname")) {
      form.setValue("nickname", user.username, { shouldValidate: false });
    }
  }, [user?.username, form]);

  const joinLeagueMutation = useMutation({
    mutationFn: async (data: JoinLeagueFormData) => {
      const response = await apiRequest("POST", "/api/leagues/join", { inviteCode: data.inviteCode, nickname: data.nickname });
      return await response.json() as { message?: string; league?: League };
    },
    onSuccess: (result) => {
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
    onError: (error: Error) => {
      let errorMessage = "Failed to join league";
      
      if (error?.message) {
        if (error.message.includes(":")) {
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
            <FormField
              control={form.control}
              name="nickname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>League Nickname</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="How you'll appear in this league"
                      {...field}
                      maxLength={25}
                    />
                  </FormControl>
                  <FormDescription>Your display name in this league (3–25 characters).</FormDescription>
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