import { NFLGame } from "@/lib/types";
import { getTeamLogo } from "@/lib/teamLogos";
import { formatGameTime } from "@/lib/formatDate";
import { Clock } from "lucide-react";

type NFLGameCardProps = {
  game: NFLGame;
  selectedTeamId: number | null;
  onSelect: (gameId: number, teamId: number) => void;
  disabled?: boolean;
};

export default function NFLGameCard({ game, selectedTeamId, onSelect, disabled = false }: NFLGameCardProps) {
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
  
  // Radio button IDs
  const firstTeamRadioId = `pick-${firstTeam.abbreviation}-${game.id}`;
  const secondTeamRadioId = `pick-${secondTeam.abbreviation}-${game.id}`;

  return (
    <div className="game-card transition-all duration-150 ease-in-out border border-gray-200 rounded-lg mb-4 last:mb-0 overflow-hidden shadow-sm hover:shadow-md">
      {/* Game time header */}
      <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center text-xs text-blue-800">
        <Clock className="h-3 w-3 mr-1" />
        <span>{formatGameTime(game.gameTime)}</span>
      </div>
      
      <div className="p-4 bg-gradient-to-b from-white to-gray-50">
        <div className="flex flex-col sm:flex-row sm:items-center">
          {/* First Team (Underdog or Away) */}
          <div className="flex items-center flex-1 bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
            <div className="relative w-6 h-6 mr-3">
              <input 
                type="radio" 
                name="pick" 
                value={firstTeam.id.toString()} 
                id={firstTeamRadioId} 
                className="sr-only team-selection-radio" 
                checked={selectedTeamId === firstTeam.id}
                onChange={() => onSelect(game.id, firstTeam.id)}
                disabled={disabled || !isFirstTeamUnderdog}
              />
              <label 
                htmlFor={firstTeamRadioId} 
                className={`team-selection-indicator absolute inset-0 w-6 h-6 rounded-full border-2 ${
                  disabled || !isFirstTeamUnderdog 
                    ? 'border-gray-200 bg-gray-100 cursor-not-allowed' 
                    : 'border-secondary cursor-pointer hover:border-primary'
                }`}
              ></label>
            </div>
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
          <div className="flex items-center flex-1 bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
            <div className="relative w-6 h-6 mr-3">
              <input 
                type="radio" 
                name="pick" 
                value={secondTeam.id.toString()} 
                id={secondTeamRadioId} 
                className="sr-only team-selection-radio" 
                checked={selectedTeamId === secondTeam.id}
                onChange={() => onSelect(game.id, secondTeam.id)}
                disabled={disabled || isFirstTeamUnderdog}
              />
              <label 
                htmlFor={secondTeamRadioId} 
                className={`team-selection-indicator absolute inset-0 w-6 h-6 rounded-full border-2 ${
                  disabled || isFirstTeamUnderdog 
                    ? 'border-gray-200 bg-gray-100 cursor-not-allowed' 
                    : 'border-secondary cursor-pointer hover:border-primary'
                }`}
              ></label>
            </div>
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
                {isSecondTeamHome && (
                  <div className="text-xs mt-1 inline-block bg-blue-100 text-blue-800 font-medium px-2 py-0.5 rounded-full">
                    HOME
                  </div>
                )}
                {!isFirstTeamUnderdog && (
                  <div className="text-xs ml-1 mt-1 inline-block bg-green-100 text-green-800 font-medium px-2 py-0.5 rounded-full">
                    UNDERDOG {spreadText}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
