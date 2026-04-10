import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GolfTournament } from "@/lib/types";

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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trophy, Flag } from "lucide-react";
import { format } from "date-fns";

const createLeagueSchema = z.object({
  name: z.string().min(1, "League name is required").max(100, "League name must be 100 characters or less"),
  description: z.string().max(500, "Description must be 500 characters or less").optional(),
  sportType: z.enum(["nfl", "golf"]).default("nfl"),
  golfTournamentId: z.string().optional(),
});

type CreateLeagueFormData = z.infer<typeof createLeagueSchema>;

interface CreateLeagueProps {
  onLeagueCreated?: (league: any) => void;
}

export default function CreateLeague({ onLeagueCreated }: CreateLeagueProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateLeagueFormData>({
    resolver: zodResolver(createLeagueSchema),
    defaultValues: {
      name: "",
      description: "",
      sportType: "nfl",
      golfTournamentId: "",
    },
  });

  const sportType = form.watch("sportType");

  // Fetch golf tournaments when Golf is selected
  const { data: golfTournaments } = useQuery<GolfTournament[]>({
    queryKey: ["/api/golf/tournaments"],
    enabled: sportType === "golf",
  });

  const createLeagueMutation = useMutation({
    mutationFn: async (data: CreateLeagueFormData) => {
      const payload: any = {
        name: data.name,
        description: data.description,
        sportType: data.sportType,
      };
      if (data.sportType === "golf") {
        payload.golfTournamentId = data.golfTournamentId;
      }
      return apiRequest("POST", "/api/leagues", payload);
    },
    onSuccess: (newLeague: any) => {
      toast({
        title: "League Created!",
        description: `${newLeague.name} has been created successfully. You are now the admin.`,
      });
      form.reset();
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/user/leagues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      onLeagueCreated?.(newLeague);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create league",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CreateLeagueFormData) => {
    if (data.sportType === "golf" && !data.golfTournamentId) {
      form.setError("golfTournamentId", { message: "Please select a tournament" });
      return;
    }
    createLeagueMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Create League
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Trophy className="h-5 w-5 mr-2 text-yellow-600" />
            Create New League
          </DialogTitle>
          <DialogDescription>
            Create your own pool league. Choose the sport type and invite others to join.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="sportType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>League Type</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue("golfTournamentId", "");
                      }}
                      disabled={createLeagueMutation.isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select league type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nfl">
                          <div className="flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-blue-600" />
                            NFL Upset Pool
                          </div>
                        </SelectItem>
                        <SelectItem value="golf">
                          <div className="flex items-center gap-2">
                            <Flag className="h-4 w-4 text-green-600" />
                            Golf — Major Championship
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {sportType === "golf" && (
              <FormField
                control={form.control}
                name="golfTournamentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tournament</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={createLeagueMutation.isPending}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a tournament" />
                        </SelectTrigger>
                        <SelectContent>
                          {golfTournaments && golfTournaments.length > 0 ? (
                            golfTournaments.map((t) => (
                              <SelectItem key={t.id} value={t.id.toString()}>
                                {t.name} ({t.season})
                                {t.picksLockAt && (
                                  <span className="text-gray-400 ml-2 text-xs">
                                    — Locks {format(new Date(t.picksLockAt), "MMM d")}
                                  </span>
                                )}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="none" disabled>
                              No tournaments available yet
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      Picks {golfTournaments?.find(t => t.id.toString() === field.value)?.picksRequired ?? 4} golfers per user
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>League Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={sportType === "golf" ? "e.g., Office Masters Pool" : "e.g., Office Fantasy League"}
                      {...field}
                      disabled={createLeagueMutation.isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    Choose a unique name for your league (max 100 characters)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add a description for your league..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      disabled={createLeagueMutation.isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    Describe your league rules or theme (max 500 characters)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createLeagueMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createLeagueMutation.isPending}
              >
                {createLeagueMutation.isPending ? (
                  <>Creating...</>
                ) : (
                  <>
                    <Trophy className="h-4 w-4 mr-2" />
                    Create League
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
