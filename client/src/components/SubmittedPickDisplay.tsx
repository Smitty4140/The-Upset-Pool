import React from 'react';
import { UserPick } from '@/lib/types';
import { Check, Award } from 'lucide-react';

type SubmittedPickDisplayProps = {
  userPick: UserPick;
};

export default function SubmittedPickDisplay({ userPick }: SubmittedPickDisplayProps) {
  if (!userPick || !userPick.pickedTeam || !userPick.game) {
    return null;
  }

  const isHomeTeam = userPick.game.homeTeamId === userPick.pickedTeamId;
  const opponent = isHomeTeam ? userPick.game.awayTeam : userPick.game.homeTeam;
  
  // Calculate the correct spread display for the picked team
  const gameSpread = Number(userPick.game.spread);
  let spreadValue: string;
  
  if (userPick.isUnderdog) {
    // For underdogs, show the points they receive (always positive)
    const underdogSpread = Math.abs(gameSpread);
    spreadValue = `+${underdogSpread.toFixed(1)}`;
  } else {
    // For favorites, show the points they give (always negative)  
    const favoriteSpread = Math.abs(gameSpread);
    spreadValue = `-${favoriteSpread.toFixed(1)}`;
  }

  return (
    <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-md border border-green-200 shadow-sm mt-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-gray-600">Your Selected Pick:</h3>
        <div className="bg-primary text-white text-xs font-bold px-2 py-1 rounded-sm">
          Current Selection
        </div>
      </div>
      
      <div className="flex items-center">
        <div className="w-12 h-12 flex-shrink-0 mr-3 bg-white p-1 rounded-full shadow-sm border border-gray-100">
          <img 
            src={userPick.pickedTeam.logoUrl} 
            alt={`${userPick.pickedTeam.name} logo`} 
            className="w-full h-full object-contain"
          />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center">
            <span className="font-bold text-lg text-gray-900 mr-2">{userPick.pickedTeam.name}</span>
            <Check className="w-4 h-4 text-green-600" />
          </div>
          
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {userPick.isUnderdog ? (
              <span className="bg-lime-100 text-lime-800 px-2 py-0.5 rounded-full text-xs font-semibold flex items-center">
                <Award className="w-3 h-3 mr-1" />
                UNDERDOG {spreadValue}
              </span>
            ) : (
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-semibold flex items-center">
                <Award className="w-3 h-3 mr-1" />
                FAVORITE {spreadValue}
              </span>
            )}
            
            <span className="text-gray-500 text-xs">
              vs. {opponent.name} ({isHomeTeam ? 'HOME' : 'AWAY'})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}