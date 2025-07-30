import { useQuery } from "@tanstack/react-query";
import { NFLWeek } from "@/lib/types";
import { Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface WeekSelectorProps {
  currentWeekId: number | null;
  onWeekChange: (weekId: number) => void;
  className?: string;
}

// Helper function to format date range for display
const formatDateRange = (startDate: string, endDate: string): string => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const options: Intl.DateTimeFormatOptions = { 
    month: 'short', 
    day: 'numeric' 
  };
  
  const startFormatted = start.toLocaleDateString('en-US', options);
  const endFormatted = end.toLocaleDateString('en-US', options);
  
  return `${startFormatted} - ${endFormatted}`;
};

export default function WeekSelector({ currentWeekId, onWeekChange, className }: WeekSelectorProps) {
  // Fetch all NFL weeks
  const { data: weeks, isLoading } = useQuery<NFLWeek[]>({
    queryKey: ["/api/nfl-weeks"],
  });

  // Get the current displayed week
  const currentWeek = weeks?.find(week => week.id === currentWeekId) || null;

  const handleWeekChange = (value: string) => {
    const weekId = parseInt(value);
    onWeekChange(weekId);
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center space-x-2", className)}>
        <Calendar className="h-4 w-4 text-gray-400" />
        <Skeleton className="h-9 w-48" />
      </div>
    );
  }

  if (!weeks || weeks.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Calendar className="h-4 w-4 text-primary" />
      <Select value={currentWeekId?.toString() || ""} onValueChange={handleWeekChange}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select a week" />
        </SelectTrigger>
        <SelectContent>
          {weeks.map((week) => (
            <SelectItem key={week.id} value={week.id.toString()}>
              Week {week.weekNumber} ({formatDateRange(week.startDate, week.endDate)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}