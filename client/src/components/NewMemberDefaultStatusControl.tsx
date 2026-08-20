import { useEffect, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NewMemberDefaultStatusControlProps {
  leagueId: number;
  defaultMemberIsActive: boolean;
}

export default function NewMemberDefaultStatusControl({
  leagueId,
  defaultMemberIsActive,
}: NewMemberDefaultStatusControlProps) {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState(
    defaultMemberIsActive ? "active" : "inactive",
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedStatus(defaultMemberIsActive ? "active" : "inactive");
  }, [defaultMemberIsActive]);

  const handleStatusChange = async (nextStatus: string) => {
    if (nextStatus === selectedStatus) return;

    const previousStatus = selectedStatus;
    const nextIsActive = nextStatus === "active";
    setSelectedStatus(nextStatus);
    setIsSaving(true);

    try {
      const response = await apiRequest(
        "PATCH",
        `/api/leagues/${leagueId}/default-member-status`,
        { defaultMemberIsActive: nextIsActive },
      );
      const result = await response.json();

      queryClient.setQueryData(
        [`/api/leagues/${leagueId}`],
        result.league,
      );
      await queryClient.invalidateQueries({ queryKey: ["/api/user/leagues"] });

      toast({
        title: "Default status saved",
        description: result.message,
      });
    } catch (error: any) {
      setSelectedStatus(previousStatus);
      toast({
        title: "Could not save default status",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div className="text-sm font-medium mb-1">New users default status</div>
      <p className="text-sm text-muted-foreground mb-3">
        Choose whether people who join this league start eligible to make picks.
        Existing members are not changed.
      </p>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Select
          value={selectedStatus}
          onValueChange={handleStatusChange}
          disabled={isSaving}
        >
          <SelectTrigger
            className="w-full sm:w-48"
            aria-label="New users default status"
            data-testid="select-new-users-default-status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {isSaving ? "Saving..." : "Changes save automatically"}
        </span>
      </div>
    </div>
  );
}