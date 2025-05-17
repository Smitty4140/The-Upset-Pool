import { useQuery } from "@tanstack/react-query";
import { NFLWeek } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface WeekSelectorProps {
  currentWeekId: number | null;
  onWeekChange: (weekId: number) => void;
  className?: string;
}

export default function WeekSelector({ currentWeekId, onWeekChange, className }: WeekSelectorProps) {
  // Fetch all NFL weeks
  const { data: weeks, isLoading } = useQuery<NFLWeek[]>({
    queryKey: ["/api/nfl-weeks"],
  });

  // Get the current displayed week
  const currentWeek = weeks?.find(week => week.id === currentWeekId) || null;
  
  // Get previous and next week IDs if they exist
  const currentIndex = weeks?.findIndex(week => week.id === currentWeekId) || -1;
  const prevWeekId = currentIndex > 0 ? weeks?.[currentIndex - 1].id : null;
  const nextWeekId = currentIndex < (weeks?.length || 0) - 1 ? weeks?.[currentIndex + 1].id : null;

  // Handle navigation
  const handlePrevWeek = () => {
    if (prevWeekId) onWeekChange(prevWeekId);
  };

  const handleNextWeek = () => {
    if (nextWeekId) onWeekChange(nextWeekId);
  };

  // Handle week selection
  const handleSelectWeek = (weekId: number) => {
    onWeekChange(weekId);
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-between py-2", className)}>
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-20" />
      </div>
    );
  }

  if (!weeks || weeks.length === 0 || !currentWeek) {
    return null;
  }

  return (
    <div className={cn("flex items-center justify-between py-2", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrevWeek}
        disabled={!prevWeekId}
        className="flex items-center text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Previous
      </Button>
      
      <div className="flex items-center space-x-1">
        <Calendar className="h-4 w-4 text-primary" />
        <span className="font-medium">Week {currentWeek.weekNumber}</span>
        <span className="hidden sm:inline text-sm text-gray-500">
          ({new Date(currentWeek.startDate).toLocaleDateString()} - {new Date(currentWeek.endDate).toLocaleDateString()})
        </span>
        
        {/* Week quick selector (mobile friendly) */}
        <div className="ml-2 hidden md:flex space-x-1">
          {weeks.map(week => (
            <Button
              key={week.id}
              variant={week.id === currentWeekId ? "default" : "ghost"}
              size="sm"
              className={cn(
                "w-9 h-9 p-0 text-xs",
                week.id === currentWeekId 
                  ? "bg-primary text-white" 
                  : "text-gray-600 hover:bg-gray-100"
              )}
              onClick={() => handleSelectWeek(week.id)}
            >
              {week.weekNumber}
            </Button>
          ))}
        </div>
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={handleNextWeek}
        disabled={!nextWeekId}
        className="flex items-center text-gray-600 hover:text-gray-900"
      >
        Next
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}