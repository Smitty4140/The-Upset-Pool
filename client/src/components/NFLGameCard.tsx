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

  // Label text for spread
  const spreadText = isHomeUnderdog 
    ? `+${game.spread}` // Home team is underdog (positive spread)
    : isAwayUnderdog 
      ? `${game.spread}` // Away team is underdog (negative spread)
      : "EVEN"; // No underdog (spread is 0)

  // Radio button IDs
  const homeTeamRadioId = `pick-${game.homeTeam.abbreviation}-${game.id}`;
  const awayTeamRadioId = `pick-${game.awayTeam.abbreviation}-${game.id}`;

  return (
    <div className="game-card transition-all duration-150 ease-in-out border border-gray-200 rounded-lg mb-4 last:mb-0 overflow-hidden shadow-sm hover:shadow-md">
      {/* Game time header */}
      <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center text-xs text-blue-800">
        <Clock className="h-3 w-3 mr-1" />
        <span>{formatGameTime(game.gameTime)}</span>
      </div>
      
      <div className="p-4 bg-gradient-to-b from-white to-gray-50">
        <div className="flex flex-col sm:flex-row sm:items-center">
          {/* Away Team */}
          <div className="flex items-center flex-1 bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
            <div className="relative w-6 h-6 mr-3">
              <input 
                type="radio" 
                name="pick" 
                value={game.awayTeam.id.toString()} 
                id={awayTeamRadioId} 
                className="sr-only team-selection-radio" 
                checked={selectedTeamId === game.awayTeam.id}
                onChange={() => onSelect(game.id, game.awayTeam.id)}
                disabled={disabled || !isAwayUnderdog}
              />
              <label 
                htmlFor={awayTeamRadioId} 
                className={`team-selection-indicator absolute inset-0 w-6 h-6 rounded-full border-2 ${
                  disabled || !isAwayUnderdog 
                    ? 'border-gray-200 bg-gray-100 cursor-not-allowed' 
                    : 'border-secondary cursor-pointer hover:border-primary'
                }`}
              ></label>
            </div>
            <div className="flex items-center">
              <div className="w-12 h-12 flex-shrink-0 mr-3 bg-gray-50 rounded-full p-1 border border-gray-200">
                <img 
                  src={game.awayTeam.logoUrl || getTeamLogo(game.awayTeam.abbreviation)} 
                  alt={`${game.awayTeam.name} logo`} 
                  className="w-full h-full object-contain" 
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = 'https://placehold.co/100x100?text=' + game.awayTeam.abbreviation;
                  }}
                />
              </div>
              <div>
                <div className="font-medium text-gray-900">{game.awayTeam.name}</div>
                <div className="text-xs text-gray-500">{game.awayTeamRecord || "(0-0)"}</div>
                {isAwayUnderdog && (
                  <div className="text-xs mt-1 inline-block bg-green-100 text-green-800 font-medium px-2 py-0.5 rounded-full">
                    UNDERDOG
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Middle Spread Section */}
          <div className="my-4 sm:my-0 px-6 py-3 rounded-full bg-gradient-to-r from-blue-500 to-secondary text-white text-center sm:mx-4 font-bold shadow-sm">
            <span>
              {spreadText}
            </span>
          </div>
          
          {/* Home Team */}
          <div className="flex items-center flex-1 bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
            <div className="relative w-6 h-6 mr-3">
              <input 
                type="radio" 
                name="pick" 
                value={game.homeTeam.id.toString()} 
                id={homeTeamRadioId} 
                className="sr-only team-selection-radio" 
                checked={selectedTeamId === game.homeTeam.id}
                onChange={() => onSelect(game.id, game.homeTeam.id)}
                disabled={disabled || !isHomeUnderdog}
              />
              <label 
                htmlFor={homeTeamRadioId} 
                className={`team-selection-indicator absolute inset-0 w-6 h-6 rounded-full border-2 ${
                  disabled || !isHomeUnderdog 
                    ? 'border-gray-200 bg-gray-100 cursor-not-allowed' 
                    : 'border-secondary cursor-pointer hover:border-primary'
                }`}
              ></label>
            </div>
            <div className="flex items-center">
              <div className="w-12 h-12 flex-shrink-0 mr-3 bg-gray-50 rounded-full p-1 border border-gray-200">
                <img 
                  src={game.homeTeam.logoUrl || getTeamLogo(game.homeTeam.abbreviation)} 
                  alt={`${game.homeTeam.name} logo`} 
                  className="w-full h-full object-contain" 
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = 'https://placehold.co/100x100?text=' + game.homeTeam.abbreviation;
                  }}
                />
              </div>
              <div>
                <div className="font-medium text-gray-900">{game.homeTeam.name}</div>
                <div className="text-xs text-gray-500">{game.homeTeamRecord || "(0-0)"}</div>
                <div className="text-xs mt-1 inline-block bg-blue-100 text-blue-800 font-medium px-2 py-0.5 rounded-full">
                  HOME
                </div>
                {isHomeUnderdog && (
                  <div className="text-xs ml-1 mt-1 inline-block bg-green-100 text-green-800 font-medium px-2 py-0.5 rounded-full">
                    UNDERDOG
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
