import React from 'react';
import { UserPick } from '@/lib/types';
import { Check, Clock } from 'lucide-react';
import { formatGameTime } from "@/lib/formatDate";

type SubmittedPickDisplayProps = {
  userPick: UserPick;
};

export default function SubmittedPickDisplay({ userPick }: SubmittedPickDisplayProps) {
  if (!userPick || !userPick.pickedTeam || !userPick.game) {
    return null;
  }

  const game = userPick.game;
  const pickedTeam = userPick.pickedTeam;
  
  // Determine which teams are underdogs based on the spread
  const isHomeUnderdog = Number(game.spread) > 0;
  const isAwayUnderdog = Number(game.spread) < 0;
  
  // Determine the absolute spread value for display
  const spreadValue = Math.abs(Number(game.spread));
  const spreadText = spreadValue === 0 ? "EVEN" : `+${spreadValue.toFixed(1)}`;

  // Get the away and home teams
  const awayTeam = game.awayTeam;
  const homeTeam = game.homeTeam;
  
  // Determine which team is the underdog
  const underdogTeam = isHomeUnderdog ? homeTeam : isAwayUnderdog ? awayTeam : null;
  
  const isPickedTeamUnderdog = underdogTeam?.id === pickedTeam.id;

  return (
    <div className="flex justify-center mb-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-3">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Your Selected Pick:</h3>
          <div className="inline-flex bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">
            Current Selection
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-green-300 shadow-md p-4 relative">
          {/* Selected Pick Indicator */}
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-1 rounded-full text-xs font-semibold flex items-center shadow-md">
            <Check className="w-3 h-3 mr-1" />
            SELECTED GAME
          </div>

          {/* Game Time */}
          <div className="text-center mb-4 mt-2">
            <div className="flex items-center justify-center text-sm text-gray-600">
              <Clock className="w-4 h-4 mr-1" />
              {formatGameTime(game.gameTime)}
            </div>
          </div>

          {/* Away Team (Top) */}
          <div className="flex items-center justify-between mb-3 p-2 rounded-lg hover:bg-gray-50">
            <div className="flex items-center">
              <div className="w-8 h-8 mr-3">
                <img 
                  src={awayTeam.logoUrl} 
                  alt={`${awayTeam.name} logo`} 
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="font-medium text-gray-900">{awayTeam.name}</span>
            </div>
            
            <div className="flex items-center space-x-2">
              {pickedTeam.id === awayTeam.id && (
                <Check className="w-4 h-4 text-green-600" />
              )}
              {isAwayUnderdog && (
                <span className="bg-lime-100 text-lime-800 px-2 py-1 rounded text-xs font-semibold">
                  {spreadText}
                </span>
              )}
            </div>
          </div>

          {/* AT divider */}
          <div className="text-center text-xs text-gray-500 mb-3">AT</div>

          {/* Home Team (Bottom) */}
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
            <div className="flex items-center">
              <div className="w-8 h-8 mr-3">
                <img 
                  src={homeTeam.logoUrl} 
                  alt={`${homeTeam.name} logo`} 
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="font-medium text-gray-900">{homeTeam.name}</span>
            </div>
            
            <div className="flex items-center space-x-2">
              {pickedTeam.id === homeTeam.id && (
                <Check className="w-4 h-4 text-green-600" />
              )}
              {isHomeUnderdog && (
                <span className="bg-lime-100 text-lime-800 px-2 py-1 rounded text-xs font-semibold">
                  {spreadText}
                </span>
              )}
            </div>
          </div>

          {/* Pick Status */}
          <div className="mt-4 pt-3 border-t border-gray-100 text-center">
            <div className="bg-green-50 text-green-800 px-3 py-2 rounded-lg text-sm font-medium">
              {isPickedTeamUnderdog ? (
                <>✓ Underdog Pick - {pickedTeam.name} {spreadText}</>
              ) : (
                <>✓ Favorite Pick - {pickedTeam.name}</>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}