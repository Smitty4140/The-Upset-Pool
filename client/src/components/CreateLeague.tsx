import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertLeagueSchema } from "@/../../shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

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
import { Plus, Trophy } from "lucide-react";

const createLeagueSchema = insertLeagueSchema.extend({
  name: z.string().min(1, "League name is required").max(100, "League name must be 100 characters or less"),
  description: z.string().max(500, "Description must be 500 characters or less").optional(),
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
    },
  });

  const createLeagueMutation = useMutation({
    mutationFn: async (data: CreateLeagueFormData) => {
      return apiRequest("POST", "/api/leagues", data);
    },
    onSuccess: (newLeague: any) => {
      toast({
        title: "League Created!",
        description: `${newLeague.name} has been created successfully. You are now the admin.`,
      });
      
      // Reset form
      form.reset();
      setOpen(false);
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/user/leagues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues"] });
      
      // Call callback if provided
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Trophy className="h-5 w-5 mr-2 text-yellow-600" />
            Create New League
          </DialogTitle>
          <DialogDescription>
            Create your own custom NFL Upset Pool league. You'll become the admin and can invite others to join.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>League Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Office Fantasy League"
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