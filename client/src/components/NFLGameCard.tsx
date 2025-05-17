import { NFLGame } from "@/lib/types";
import { getTeamLogo } from "@/lib/teamLogos";

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
    <div className="game-card transition-all duration-150 ease-in-out border border-gray-200 rounded-lg mb-4 last:mb-0 overflow-hidden hover:border-primary-300">
      <div className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center">
          {/* Away Team */}
          <div className="flex items-center flex-1">
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
                className={`team-selection-indicator absolute inset-0 w-6 h-6 rounded-full border-2 ${disabled || !isAwayUnderdog ? 'border-gray-200 bg-gray-100 cursor-not-allowed' : 'border-gray-300 cursor-pointer'}`}
              ></label>
            </div>
            <div className="flex items-center">
              <div className="w-10 h-10 flex-shrink-0 mr-3">
                <img 
                  src={getTeamLogo(game.awayTeam.abbreviation)} 
                  alt={`${game.awayTeam.name} logo`} 
                  className="w-full h-full object-contain" 
                />
              </div>
              <div>
                <div className="font-medium">{game.awayTeam.name}</div>
                <div className="text-xs text-gray-500">{game.awayTeamRecord || "(0-0)"}</div>
                {isAwayUnderdog && (
                  <div className="text-xs text-green-600 font-medium">UNDERDOG</div>
                )}
              </div>
            </div>
          </div>
          
          {/* Middle Spread Section */}
          <div className="my-4 sm:my-0 px-4 py-2 rounded-md bg-gray-100 text-center sm:mx-4">
            <span className={`font-semibold ${isHomeUnderdog || isAwayUnderdog ? "text-green-600" : "text-gray-600"}`}>
              {spreadText}
            </span>
          </div>
          
          {/* Home Team */}
          <div className="flex items-center flex-1">
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
                className={`team-selection-indicator absolute inset-0 w-6 h-6 rounded-full border-2 ${disabled || !isHomeUnderdog ? 'border-gray-200 bg-gray-100 cursor-not-allowed' : 'border-gray-300 cursor-pointer'}`}
              ></label>
            </div>
            <div className="flex items-center">
              <div className="w-10 h-10 flex-shrink-0 mr-3">
                <img 
                  src={getTeamLogo(game.homeTeam.abbreviation)} 
                  alt={`${game.homeTeam.name} logo`} 
                  className="w-full h-full object-contain" 
                />
              </div>
              <div>
                <div className="font-medium">{game.homeTeam.name}</div>
                <div className="text-xs text-gray-500">{game.homeTeamRecord || "(0-0)"}</div>
                <div className="text-xs text-gray-700 font-medium">HOME</div>
                {isHomeUnderdog && (
                  <div className="text-xs text-green-600 font-medium">UNDERDOG</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
