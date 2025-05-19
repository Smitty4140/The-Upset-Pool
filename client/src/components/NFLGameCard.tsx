import { NFLGame } from "@/lib/types";
import { getTeamLogo } from "@/lib/teamLogos";
import { formatGameTime } from "@/lib/formatDate";
import { Clock, Check } from "lucide-react";

type NFLGameCardProps = {
  game: NFLGame;
  selectedTeamId: number | null;
  selectedGameId: string | null;
  onSelect: (gameId: string, teamId: number) => void;
  disabled?: boolean;
};

export default function NFLGameCard({ game, selectedTeamId, selectedGameId, onSelect, disabled = false }: NFLGameCardProps) {
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
  
  // Make the entire game card clickable to select either team
  const handleHomeTeamClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onSelect(game.id, homeTeam.id);
  };
  
  const handleAwayTeamClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onSelect(game.id, awayTeam.id);
  };

  return (
    <div 
      className={`game-card transition-all duration-150 ease-in-out border rounded-lg mb-4 last:mb-0 overflow-hidden shadow-sm 
        ${!disabled ? 'hover:shadow-md' : ''} 
        ${isGameSelected ? 'border-primary border-2 shadow-md relative' : 'border-gray-200'}
        ${disabled ? 'opacity-75' : ''}`}
    >
      {/* Game time header */}
      <div className="bg-white px-4 py-3 flex items-center text-sm text-blue-800 border-b border-gray-100">
        <div className="flex items-center">
          <Clock className="h-4 w-4 mr-2 text-blue-700" />
          <span className="text-blue-800 font-medium">{formatGameTime(game.gameTime)}</span>
        </div>
      </div>
      
      <div className="bg-white">
        {/* Away Team Row */}
        <div className="px-4 py-4 flex items-center justify-between cursor-pointer" onClick={handleAwayTeamClick}>
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
            <div className="bg-blue-100 text-blue-800 px-4 py-1.5 rounded-full font-bold text-lg">
              {spreadText}
            </div>
          )}
        </div>
        
        {/* AT text aligned with team name */}
        <div className="pl-19 ml-16 pb-1 text-xs text-gray-500 text-left">
          AT
        </div>
        
        {/* Home Team Row */}
        <div className="px-4 py-4 flex items-center justify-between cursor-pointer" onClick={handleHomeTeamClick}>
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
            <div className="bg-blue-100 text-blue-800 px-4 py-1.5 rounded-full font-bold text-lg">
              {spreadText}
            </div>
          )}
        </div>
      </div>
      
      {/* Selection indicator */}
      {isGameSelected && (
        <div className="bg-green-600 text-white text-sm font-bold text-center py-2 flex items-center justify-center space-x-1">
          <Check size={16} />
          <span>Selected Game</span>
        </div>
      )}
    </div>
  );
}
