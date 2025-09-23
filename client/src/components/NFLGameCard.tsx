import { useState, useEffect } from "react";
import { NFLGame } from "@/lib/types";
import { getTeamLogo } from "@/lib/teamLogos";
import { formatGameTime } from "@/lib/formatDate";
import { Clock, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type NFLGameCardProps = {
  game: NFLGame;
  selectedTeamId: number | null;
  selectedGameId: string | null;
  onSelect: (gameId: string, teamId: number) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  isViewingFutureWeek?: boolean;
  isSubmitting?: boolean;
  isInactive?: boolean;
};

export default function NFLGameCard({ game, selectedTeamId, selectedGameId, onSelect, onSubmit, disabled = false, isViewingFutureWeek = false, isSubmitting = false, isInactive = false }: NFLGameCardProps) {
  // State to track current time for automatic refresh
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Auto-refresh the current time to keep game lock status synchronized
  useEffect(() => {
    const gameKickoffTime = new Date(game.gameTime);
    const timeDiff = gameKickoffTime.getTime() - new Date().getTime();
    
    // If game starts within 2 hours, refresh every 30 seconds for accuracy
    // Otherwise, refresh every 5 minutes to save resources
    const refreshInterval = timeDiff < 2 * 60 * 60 * 1000 ? 30000 : 300000;
    
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [game.gameTime]);
  
  // Check if the game has already started (kickoff time passed)
  const gameKickoffTime = new Date(game.gameTime);
  const hasGameStarted = currentTime > gameKickoffTime;
  
  // Determine which teams are underdogs based on the spread
  const isHomeUnderdog = Number(game.spread) > 0;
  const isAwayUnderdog = Number(game.spread) < 0;
  
  // Determine the absolute spread value for display
  const spreadValue = Math.abs(Number(game.spread));
  const spreadText = spreadValue === 0 ? "EVEN" : `+${spreadValue.toFixed(1)}`;

  // Get the away and home teams (always show away team first, home team second)
  const awayTeam = game.awayTeam;
  const homeTeam = game.homeTeam;
  
  // Determine which team is the underdog
  const underdogTeam = isHomeUnderdog ? homeTeam : isAwayUnderdog ? awayTeam : null;
  
  // Get the underdog team ID for selection
  const underdogTeamId = underdogTeam?.id || null;
  
  // Only consider a game selected if both the game ID and team ID match
  const isGameSelected = selectedTeamId !== null && 
                        selectedGameId === game.id;
  
  // Always select the underdog team regardless of which team is clicked
  const handleHomeTeamClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || isViewingFutureWeek || isInactive || hasGameStarted) return;
    // Always select the underdog team
    if (underdogTeamId) {
      onSelect(game.id, underdogTeamId);
    }
  };
  
  const handleAwayTeamClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || isViewingFutureWeek || isInactive || hasGameStarted) return;
    // Always select the underdog team
    if (underdogTeamId) {
      onSelect(game.id, underdogTeamId);
    }
  };

  const tooltipContent = isInactive
    ? "Your team is not activated. Contact your league admin to start picking upsets."
    : hasGameStarted
      ? "This game has already started and is no longer available for picks"
    : isViewingFutureWeek 
      ? "Picks are not allowed until 12 hours before the first game of the week. Spreads may change until that point."
      : disabled 
        ? "Picks are locked for this week"
        : null;

  const gameCard = (
    <div 
      className={`game-card transition-all duration-150 ease-in-out border rounded-lg mb-4 last:mb-0 overflow-hidden shadow-sm 
        ${!disabled && !isViewingFutureWeek && !isInactive && !hasGameStarted ? 'hover:shadow-md' : ''} 
        ${isGameSelected ? 'border-primary border-2 shadow-md relative' : 'border-gray-200'}
        ${disabled || isViewingFutureWeek || isInactive || hasGameStarted ? 'opacity-75' : ''}
        ${isViewingFutureWeek || isInactive || hasGameStarted ? 'cursor-not-allowed' : ''}
        ${hasGameStarted ? 'bg-gray-50 border-gray-300' : ''}`}
    >
      {/* Selected Game indicator at the top */}
      {isGameSelected && (
        <div className="bg-green-600 text-white text-sm font-bold text-center py-2 flex items-center justify-center space-x-1">
          <Check size={16} />
          <span>Selected Game</span>
        </div>
      )}
      
      {/* Game time header */}
      <div className={`px-4 py-3 flex items-center justify-between text-sm border-b border-gray-100 ${hasGameStarted ? 'bg-gray-100' : 'bg-white'}`}>
        <div className="flex items-center">
          <Clock className={`h-4 w-4 mr-2 ${hasGameStarted ? 'text-gray-500' : 'text-blue-700'}`} />
          <span className={`font-medium ${hasGameStarted ? 'text-gray-600' : 'text-blue-800'}`}>{formatGameTime(game.gameTime)}</span>
        </div>
        {hasGameStarted && (
          <div className="flex items-center text-red-600">
            <Lock className="h-4 w-4 mr-1" />
            <span className="text-xs font-medium">STARTED</span>
          </div>
        )}
      </div>
      
      <div className="bg-white">
        {/* Away Team Row */}
        <div 
          className={`px-4 py-4 flex items-center justify-between transition-colors ${
            !disabled && !isViewingFutureWeek && !isInactive && !hasGameStarted ? 'cursor-pointer hover:bg-blue-50' : 'cursor-not-allowed'
          } ${disabled || isViewingFutureWeek || isInactive || hasGameStarted ? 'opacity-60' : ''
          }`} 
          onClick={handleAwayTeamClick}
        >
          <div className="flex items-center">
            <div className="w-12 h-12 flex-shrink-0 mr-3">
              <img 
                src={awayTeam.logoUrl || getTeamLogo(awayTeam.abbreviation)} 
                alt={`${awayTeam.name} logo`} 
                className="w-full h-full object-contain" 
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = 'https://placehold.co/100x100?text=' + awayTeam.abbreviation;
                }}
              />
            </div>
            <div className="font-bold text-gray-800 text-xl">{awayTeam.name}</div>
          </div>
          
          {/* Away Team spread if they're the underdog */}
          {isAwayUnderdog && (
            <div className="bg-green-100 text-green-800 px-4 py-1.5 rounded-full font-bold text-lg">
              {spreadText}
            </div>
          )}
        </div>
        
        {/* AT text aligned with team name */}
        <div className="pl-19 ml-16 pb-1 text-xs text-gray-500 text-left">
          AT
        </div>
        
        {/* Home Team Row */}
        <div 
          className={`px-4 py-4 flex items-center justify-between transition-colors ${
            !disabled && !isViewingFutureWeek && !isInactive && !hasGameStarted ? 'cursor-pointer hover:bg-blue-50' : 'cursor-not-allowed'
          } ${disabled || isViewingFutureWeek || isInactive || hasGameStarted ? 'opacity-60' : ''
          }`} 
          onClick={handleHomeTeamClick}
        >
          <div className="flex items-center">
            <div className="w-12 h-12 flex-shrink-0 mr-3">
              <img 
                src={homeTeam.logoUrl || getTeamLogo(homeTeam.abbreviation)} 
                alt={`${homeTeam.name} logo`}
                className="w-full h-full object-contain" 
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = 'https://placehold.co/100x100?text=' + homeTeam.abbreviation;
                }}
              />
            </div>
            <div className="font-bold text-gray-800 text-xl">{homeTeam.name}</div>
          </div>
          
          {/* Home Team spread if they're the underdog */}
          {isHomeUnderdog && (
            <div className="bg-green-100 text-green-800 px-4 py-1.5 rounded-full font-bold text-lg">
              {spreadText}
            </div>
          )}
        </div>
      </div>
      
      {/* Submit button at the bottom when game is selected */}
      {isGameSelected && onSubmit && !disabled && !isViewingFutureWeek && !isInactive && !hasGameStarted && (
        <div className="bg-gray-50 px-4 py-3 border-t border-gray-100">
          <Button 
            onClick={(e) => {
              e.stopPropagation();
              onSubmit();
            }}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-2 px-4 rounded"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Submitting...</span>
              </span>
            ) : (
              "SUBMIT PICK"
            )}
          </Button>
        </div>
      )}
    </div>
  );

  // Wrap with tooltip if there's content to show
  if (tooltipContent) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {gameCard}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p>{tooltipContent}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return gameCard;
}
