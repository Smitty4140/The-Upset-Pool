import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatGameTime, getRelativeTimeDisplay } from '@/lib/formatDate';
import { Skeleton } from "@/components/ui/skeleton";

type NFLOddsProps = {
  className?: string;
};

type Bookmaker = {
  key: string;
  title: string;
  last_update: string;
  markets: {
    key: string;
    last_update: string;
    outcomes: {
      name: string;
      price: number;
    }[];
  }[];
};

type OddsGame = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
};

export default function NFLOddsDisplay({ className }: NFLOddsProps) {
  const { data: oddsData, isLoading, error } = useQuery<OddsGame[]>({
    queryKey: ['/api/nfl-odds'],
    staleTime: 1000 * 60 * 15, // 15 minutes
  });

  // Convert American odds to spread
  const getSpreadFromOdds = (homeOdds: number, awayOdds: number): number => {
    if (homeOdds < 0 && awayOdds > 0) {
      // Home team is favored
      return Math.round(-homeOdds / 100 * 2.5) / 2;
    } else if (awayOdds < 0 && homeOdds > 0) {
      // Away team is favored
      return -Math.round(-awayOdds / 100 * 2.5) / 2;
    }
    return 0;
  };

  const findUnderdog = (game: OddsGame): string => {
    if (!game.bookmakers || game.bookmakers.length === 0) return '';
    
    const mainBookmaker = game.bookmakers[0];
    const h2hMarket = mainBookmaker.markets.find(m => m.key === 'h2h');
    
    if (!h2hMarket || h2hMarket.outcomes.length < 2) return '';
    
    const homeOutcome = h2hMarket.outcomes.find(o => o.name === game.home_team);
    const awayOutcome = h2hMarket.outcomes.find(o => o.name === game.away_team);
    
    if (!homeOutcome || !awayOutcome) return '';
    
    if (homeOutcome.price > awayOutcome.price) {
      return game.home_team;
    } else {
      return game.away_team;
    }
  };

  const renderGame = (game: OddsGame) => {
    if (!game.bookmakers || game.bookmakers.length === 0) return null;
    
    const mainBookmaker = game.bookmakers[0];
    const h2hMarket = mainBookmaker.markets.find(m => m.key === 'h2h');
    
    if (!h2hMarket || h2hMarket.outcomes.length < 2) return null;
    
    const homeOutcome = h2hMarket.outcomes.find(o => o.name === game.home_team);
    const awayOutcome = h2hMarket.outcomes.find(o => o.name === game.away_team);
    
    if (!homeOutcome || !awayOutcome) return null;
    
    const spreadValue = getSpreadFromOdds(homeOutcome.price, awayOutcome.price);
    const underdogTeam = findUnderdog(game);
    const gameDate = new Date(game.commence_time);

    return (
      <Card key={game.id} className="mb-4 overflow-hidden bg-gradient-to-b from-slate-100 to-white dark:from-slate-900 dark:to-slate-800">
        <CardHeader className="p-4 pb-2">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-md">{game.away_team} @ {game.home_team}</CardTitle>
              <CardDescription>
                {formatGameTime(game.commence_time)} ({getRelativeTimeDisplay(game.commence_time)})
              </CardDescription>
            </div>
            <Badge variant={underdogTeam ? "secondary" : "outline"}>
              {underdogTeam ? `Underdog: ${underdogTeam}` : "Even Odds"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center">
              <span className="text-sm font-medium">{game.away_team}</span>
              <span className={`text-xl font-bold ${awayOutcome.price > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {awayOutcome.price > 0 ? '+' : ''}{awayOutcome.price}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-sm font-medium">{game.home_team}</span>
              <span className={`text-xl font-bold ${homeOutcome.price > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {homeOutcome.price > 0 ? '+' : ''}{homeOutcome.price}
              </span>
            </div>
          </div>
          <div className="mt-3 text-center">
            <span className="text-sm text-gray-500">
              Implied Spread: {spreadValue > 0 ? `+${spreadValue}` : spreadValue}
            </span>
          </div>
          <div className="mt-1 text-center">
            <span className="text-xs text-gray-400">
              Data from {mainBookmaker.title} as of {new Date(mainBookmaker.last_update).toLocaleTimeString()}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className={className}>
        <h2 className="text-2xl font-bold mb-4">Latest NFL Odds</h2>
        {[1, 2, 3].map((i) => (
          <Card key={i} className="mb-4">
            <CardHeader>
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-3 w-[200px] mt-2" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <Card className="border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Error Loading Odds</CardTitle>
          </CardHeader>
          <CardContent>
            <p>We couldn't load the latest NFL odds. Please try again later.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={className}>
      <h2 className="text-2xl font-bold mb-4">Latest NFL Odds</h2>
      {oddsData && oddsData.length > 0 ? (
        oddsData.map(game => renderGame(game))
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Odds Available</CardTitle>
          </CardHeader>
          <CardContent>
            <p>There are currently no NFL odds available. Please check back later.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}