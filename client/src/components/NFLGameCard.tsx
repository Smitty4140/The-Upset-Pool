import { useState, useEffect } from "react";
import { NFLGame } from "@/lib/types";
import { getTeamLogo } from "@/lib/teamLogos";
import { formatGameTime } from "@/lib/formatDate";
import { Clock, Check, Lock, AlertCircle } from "lucide-react";
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
  disabled?: boolean;
  isViewingFutureWeek?: boolean;
  isInactive?: boolean;
  isPickLockedByKickoff?: boolean;
  spreadsNotPulled?: boolean;
};

export default function NFLGameCard({ game, selectedTeamId, selectedGameId, submittedPickGameId, onSelect, disabled = false, isViewingFutureWeek = false, isInactive = false, isPickLockedByKickoff = false, spreadsNotPulled = false }: NFLGameCardProps) {
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
  const bannerStyle = isSubmittedPick && isPickLockedByKickoff
    ? { className: 'bg-amber-600 text-white', icon: <Lock size={16} />, label: 'Your pick — locked' }
    : isSubmittedPick
      ? { className: 'bg-green-600 text-white', icon: <Check size={16} />, label: 'Your pick for this week' }
      : { className: 'bg-blue-600 text-white', icon: <AlertCircle size={16} />, label: 'Selected — not saved yet' };

  const isFullyLocked = disabled || isViewingFutureWeek || isInactive || hasGameStarted || isPickLockedByKickoff || spreadsNotPulled;

  // An even-spread game has no underdog, so it is unpickable even when open
  const isPickable = !isFullyLocked && !!underdogTeamId;

  // The card is one pick, so anywhere on it selects the underdog
  const handleCardClick = () => {
    if (!isPickable || !underdogTeamId) return;
    onSelect(game.id, underdogTeamId);
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
      className={`game-card group transition-all duration-150 ease-in-out border rounded-lg overflow-hidden shadow-sm 
        ${isPickable ? 'cursor-pointer hover:shadow-md hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2' : 'cursor-not-allowed'} 
        ${showHighlight ? 'border-primary border-2 shadow-md relative' : 'border-gray-200'}
        ${isFullyLocked ? 'opacity-75' : ''}
        ${hasGameStarted || (isPickLockedByKickoff && !showHighlight) ? 'bg-gray-50 border-gray-300' : ''}`}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (!isPickable) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      role={isPickable ? 'button' : undefined}
      tabIndex={isPickable ? 0 : undefined}
      aria-label={isPickable && underdogTeam ? `Pick ${underdogTeam.name} ${spreadText}` : undefined}
    >
      {/* Pick state banner: locked pick, saved pick, or an unsaved selection */}
      {showHighlight && (
        <div className={`${bannerStyle.className} text-sm font-bold text-center py-2 flex items-center justify-center space-x-1.5`}>
          {bannerStyle.icon}
          <span>{bannerStyle.label}</span>
        </div>
      )}
      
      {/* Game time header */}
      <div className={`px-4 py-3 flex items-center justify-between text-sm border-b border-gray-100 transition-colors ${hasGameStarted ? 'bg-gray-100' : 'bg-white'} ${isPickable ? 'group-hover:bg-blue-50' : ''}`}>
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
      
      <div className={`bg-white transition-colors ${isPickable ? 'group-hover:bg-blue-50' : ''}`}>
        {/* Away Team Row */}
        <div className={`px-4 py-4 flex items-center justify-between ${isFullyLocked ? 'opacity-60' : ''}`}>
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
            <div className="bg-green-100 text-green-800 px-4 py-1.5 rounded-full font-bold text-lg flex-shrink-0">
              {spreadText}
            </div>
          )}
        </div>

        {/* AT divider, aligned under the team names */}
        <div className="ml-4 pl-16 pb-1 text-xs text-gray-500 text-left">
          AT
        </div>
        
        {/* Home Team Row */}
        <div className={`px-4 py-4 flex items-center justify-between ${isFullyLocked ? 'opacity-60' : ''}`}>
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
            <div className="bg-green-100 text-green-800 px-4 py-1.5 rounded-full font-bold text-lg flex-shrink-0">
              {spreadText}
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

      {/* Name the side this card picks. The underdogs-only rule lives in the
          league rules, not on all sixteen cards. */}
      {!isFullyLocked && !showHighlight && underdogTeam && (
        <div className="px-4 py-2.5 bg-blue-50/60 border-t border-blue-100 text-xs text-blue-800 text-center">
          Choose this card to pick <span className="font-semibold">{underdogTeam.name}</span>.
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
