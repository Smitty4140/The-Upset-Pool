import { NFLGame } from "@/lib/types";
import { getTeamLogo } from "@/lib/teamLogos";
import { formatGameTime } from "@/lib/formatDate";
import { Clock } from "lucide-react";

type NFLGameCardProps = {
  game: NFLGame;
  selectedTeamId: number | null;
  selectedGameId: number | null;
  onSelect: (gameId: number, teamId: number) => void;
  disabled?: boolean;
};

export default function NFLGameCard({ game, selectedTeamId, selectedGameId, onSelect, disabled = false }: NFLGameCardProps) {
  // Determine which teams are underdogs based on the spread
  const isHomeUnderdog = Number(game.spread) > 0;
  const isAwayUnderdog = Number(game.spread) < 0;
  
  // Determine the absolute spread value for display
  const spreadValue = Math.abs(Number(game.spread));
  const spreadText = spreadValue === 0 ? "EVEN" : `+${spreadValue}`;

  // Set up underdog and favorite teams for display
  // We want to show the underdog first, followed by the favorite
  const underdogTeam = isHomeUnderdog ? game.homeTeam : isAwayUnderdog ? game.awayTeam : null;
  const favoriteTeam = isHomeUnderdog ? game.awayTeam : isAwayUnderdog ? game.homeTeam : null;
  
  // If there's no clear underdog (spread is 0), use home/away
  const firstTeam = underdogTeam || game.awayTeam;
  const secondTeam = favoriteTeam || game.homeTeam;
  
  // Is the first team displayed the actual underdog?
  const isFirstTeamUnderdog = !!underdogTeam;
  
  // Is the first team the home team?
  const isFirstTeamHome = firstTeam.id === game.homeTeam.id;
  const isSecondTeamHome = secondTeam.id === game.homeTeam.id;
  
  // Get the underdog team ID for selection
  const underdogTeamId = underdogTeam?.id || null;
  // Only consider a game selected if both the game ID and team ID match
  const isGameSelected = selectedTeamId !== null && 
                        selectedGameId === game.id &&
                        (selectedTeamId === firstTeam.id || selectedTeamId === secondTeam.id);
  
  // Make the entire game card clickable to select the underdog
  const handleGameCardClick = () => {
    if (disabled || !underdogTeamId) return;
    
    // If this game is already selected, do nothing
    if (selectedTeamId === underdogTeamId && selectedTeamId !== null) return;
    
    // Otherwise select this game's underdog team
    onSelect(game.id, underdogTeamId);
  };

  return (
    <div 
      className={`game-card transition-all duration-150 ease-in-out border rounded-lg mb-4 last:mb-0 overflow-hidden shadow-sm 
        ${!disabled && underdogTeamId ? 'cursor-pointer hover:shadow-md' : ''} 
        ${isGameSelected ? 'border-primary border-2' : 'border-gray-200'}
        ${disabled ? 'opacity-75' : ''}`}
      onClick={handleGameCardClick}
    >
      {/* Game time header */}
      <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center text-xs text-blue-800">
        <Clock className="h-3 w-3 mr-1" />
        <span>{formatGameTime(game.gameTime)}</span>
      </div>
      
      <div className="p-4 bg-gradient-to-b from-white to-gray-50">
        <div className="flex flex-col sm:flex-row sm:items-center">
          {/* First Team (Underdog or Away) */}
          <div className={`flex items-center flex-1 bg-white p-3 rounded-lg border shadow-sm
            ${selectedTeamId === firstTeam.id ? 'border-primary' : 'border-gray-100'}`}>
            <div className="flex items-center">
              <div className="w-12 h-12 flex-shrink-0 mr-3 bg-gray-50 rounded-full p-1 border border-gray-200">
                <img 
                  src={firstTeam.logoUrl || getTeamLogo(firstTeam.abbreviation)} 
                  alt={`${firstTeam.name} logo`} 
                  className="w-full h-full object-contain" 
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = 'https://placehold.co/100x100?text=' + firstTeam.abbreviation;
                  }}
                />
              </div>
              <div>
                <div className="font-medium text-gray-900">{firstTeam.name}</div>
                <div className="text-xs text-gray-500">
                  {isFirstTeamHome ? game.homeTeamRecord || "(0-0)" : game.awayTeamRecord || "(0-0)"}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {isFirstTeamHome && (
                    <div className="text-xs inline-block bg-blue-100 text-blue-800 font-medium px-2 py-0.5 rounded-full">
                      HOME
                    </div>
                  )}
                  {isFirstTeamUnderdog && (
                    <div className="text-xs inline-block bg-green-100 text-green-800 font-medium px-2 py-0.5 rounded-full">
                      UNDERDOG {spreadText}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Middle Versus Section */}
          <div className="my-4 sm:my-0 px-6 py-3 rounded-full bg-gradient-to-r from-blue-500 to-secondary text-white text-center sm:mx-4 font-bold shadow-sm">
            <span>VS</span>
          </div>
          
          {/* Second Team (Favorite or Home) */}
          <div className={`flex items-center flex-1 bg-white p-3 rounded-lg border shadow-sm
            ${selectedTeamId === secondTeam.id ? 'border-primary' : 'border-gray-100'}`}>
            <div className="flex items-center">
              <div className="w-12 h-12 flex-shrink-0 mr-3 bg-gray-50 rounded-full p-1 border border-gray-200">
                <img 
                  src={secondTeam.logoUrl || getTeamLogo(secondTeam.abbreviation)} 
                  alt={`${secondTeam.name} logo`} 
                  className="w-full h-full object-contain" 
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = 'https://placehold.co/100x100?text=' + secondTeam.abbreviation;
                  }}
                />
              </div>
              <div>
                <div className="font-medium text-gray-900">{secondTeam.name}</div>
                <div className="text-xs text-gray-500">
                  {isSecondTeamHome ? game.homeTeamRecord || "(0-0)" : game.awayTeamRecord || "(0-0)"}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {isSecondTeamHome && (
                    <div className="text-xs inline-block bg-blue-100 text-blue-800 font-medium px-2 py-0.5 rounded-full">
                      HOME
                    </div>
                  )}
                  {!isFirstTeamUnderdog && (
                    <div className="text-xs inline-block bg-green-100 text-green-800 font-medium px-2 py-0.5 rounded-full">
                      UNDERDOG {spreadText}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Selection indicator */}
      {isGameSelected && (
        <div className="bg-primary text-white text-xs font-medium text-center py-1">
          Selected Game
        </div>
      )}
    </div>
  );
}
