import { useState, useEffect } from "react";
import { NFLGame } from "@/lib/types";
import { getTeamLogo } from "@/lib/teamLogos";
import { formatGameTime } from "@/lib/formatDate";
import { Clock, Check, Lock, AlertCircle } from "lucide-react";
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
  submittedPickGameId?: string | null;
  onSelect: (gameId: string, teamId: number) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  isViewingFutureWeek?: boolean;
  isSubmitting?: boolean;
  isInactive?: boolean;
  isPickLockedByKickoff?: boolean;
  spreadsNotPulled?: boolean;
};

export default function NFLGameCard({ game, selectedTeamId, selectedGameId, submittedPickGameId, onSelect, onSubmit, disabled = false, isViewingFutureWeek = false, isSubmitting = false, isInactive = false, isPickLockedByKickoff = false, spreadsNotPulled = false }: NFLGameCardProps) {
  // State to track current time for automatic refresh (triggers re-renders)
  const [, setCurrentTime] = useState<Date>(new Date());
  
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
  // Always use the current time for accurate comparison
  // Parse game time consistently with formatGameTime - treat as UTC if no timezone info
  let gameKickoffTime: Date;
  const gameTimeStr = game.gameTime;
  
  if (gameTimeStr.includes('Z') || gameTimeStr.includes('+') || (gameTimeStr.includes('-') && gameTimeStr.lastIndexOf('-') > 10)) {
    // Already has timezone info
    gameKickoffTime = new Date(gameTimeStr);
  } else {
    // No timezone info - assume UTC by adding 'Z'
    gameKickoffTime = new Date(gameTimeStr + 'Z');
  }
  
  const now = new Date();
  const hasGameStarted = now > gameKickoffTime;
  
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

  // True when this game has an already-submitted pick (may differ from current local selection)
  const isSubmittedPick = !!submittedPickGameId && String(submittedPickGameId) === String(game.id);

  // Show the selected/submitted highlight if either locally selected or already submitted
  const showHighlight = isGameSelected || isSubmittedPick;

  // A selection that exists only in the browser is NOT a saved pick. Saying
  // "Selected Game" for both states is what made people think an unsaved
  // choice had been submitted, so each state gets its own wording and colour.
  const isUnsavedSelection = isGameSelected && !isSubmittedPick;
  const bannerStyle = isSubmittedPick && isPickLockedByKickoff
    ? { className: 'bg-amber-600 text-white', icon: <Lock size={16} />, label: 'Your pick — locked' }
    : isSubmittedPick
      ? { className: 'bg-green-600 text-white', icon: <Check size={16} />, label: 'Your pick for this week' }
      : { className: 'bg-blue-600 text-white', icon: <AlertCircle size={16} />, label: 'Selected — not saved yet' };

  const isFullyLocked = disabled || isViewingFutureWeek || isInactive || hasGameStarted || isPickLockedByKickoff || spreadsNotPulled;

  // Always select the underdog team regardless of which team is clicked
  const handleHomeTeamClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFullyLocked) return;
    if (underdogTeamId) {
      onSelect(game.id, underdogTeamId);
    }
  };
  
  const handleAwayTeamClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFullyLocked) return;
    if (underdogTeamId) {
      onSelect(game.id, underdogTeamId);
    }
  };

  const tooltipContent = isInactive
    ? "Your membership in this league isn't active yet. Ask your league admin to activate you, then you can make picks."
    : isPickLockedByKickoff
      ? "Your pick is locked because the game you picked has already kicked off."
    : hasGameStarted
      ? "This game has already kicked off, so it can no longer be picked."
    : spreadsNotPulled
      ? "Spreads for this week haven't been posted yet. Picks open once they arrive, 8 hours before the first game."
    : isViewingFutureWeek
      ? "Picks for this week open 8 hours before the first game. Spreads can still change until then."
      : disabled
        ? "Picks are locked for this week."
        : null;

  const gameCard = (
    <div 
      className={`game-card transition-all duration-150 ease-in-out border rounded-lg overflow-hidden shadow-sm 
        ${!isFullyLocked ? 'hover:shadow-md' : ''} 
        ${showHighlight ? 'border-primary border-2 shadow-md relative' : 'border-gray-200'}
        ${isFullyLocked ? 'opacity-75' : ''}
        ${isFullyLocked ? 'cursor-not-allowed' : ''}
        ${hasGameStarted || (isPickLockedByKickoff && !showHighlight) ? 'bg-gray-50 border-gray-300' : ''}`}
    >
      {/* Pick state banner: locked pick, saved pick, or an unsaved selection */}
      {showHighlight && (
        <div className={`${bannerStyle.className} text-sm font-bold text-center py-2 flex items-center justify-center space-x-1.5`}>
          {bannerStyle.icon}
          <span>{bannerStyle.label}</span>
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
            !isFullyLocked ? 'cursor-pointer hover:bg-blue-50' : 'cursor-not-allowed'
          } ${isFullyLocked ? 'opacity-60' : ''
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
            <div className="flex flex-col items-end flex-shrink-0">
              <div className="bg-green-100 text-green-800 px-4 py-1.5 rounded-full font-bold text-lg">
                {spreadText}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 mt-0.5">
                Underdog
              </span>
            </div>
          )}
        </div>

        {/* AT divider, aligned under the team names */}
        <div className="ml-4 pl-16 pb-1 text-xs text-gray-500 text-left">
          AT
        </div>
        
        {/* Home Team Row */}
        <div 
          className={`px-4 py-4 flex items-center justify-between transition-colors ${
            !isFullyLocked ? 'cursor-pointer hover:bg-blue-50' : 'cursor-not-allowed'
          } ${isFullyLocked ? 'opacity-60' : ''
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
            <div className="flex flex-col items-end flex-shrink-0">
              <div className="bg-green-100 text-green-800 px-4 py-1.5 rounded-full font-bold text-lg">
                {spreadText}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 mt-0.5">
                Underdog
              </span>
            </div>
          )}
        </div>
      </div>

      {/* A card with no underdog is otherwise unexplained. The week-wide "no
          spreads yet" case is announced once at the page level instead of
          repeating on all sixteen cards. */}
      {!underdogTeam && !spreadsNotPulled && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-600 text-center">
          Even spread — no underdog in this game, so it can't be picked.
        </div>
      )}

      {/* Tell first-time users that the underdog is the only pickable side */}
      {!isFullyLocked && !showHighlight && underdogTeam && (
        <div className="px-4 py-2.5 bg-blue-50/60 border-t border-blue-100 text-xs text-blue-800 text-center">
          Choose this card to pick <span className="font-semibold">{underdogTeam.name}</span> — you can only pick underdogs.
        </div>
      )}

      {/* Submit button at the bottom only when newly selected (not already
          submitted). Hidden on mobile, where the sticky bottom bar is the one
          submit affordance. */}
      {isUnsavedSelection && onSubmit && !isFullyLocked && (
        <div className="hidden sm:block bg-gray-50 px-4 py-3 border-t border-gray-100">
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
              "Submit Pick"
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
