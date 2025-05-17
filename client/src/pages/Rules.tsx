import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Rules() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">League Rules</h1>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>How the Upset Pool Works</CardTitle>
            <CardDescription>A comprehensive guide to understanding and playing the Upset Pool</CardDescription>
          </CardHeader>
          <CardContent className="prose">
            <h3>Basic Rules</h3>
            <ol>
              <li>Each week of the NFL regular season, you select one underdog team to win outright.</li>
              <li>If your selected underdog wins, you earn points equal to the spread value at the time of your pick.</li>
              <li>The point spread is fixed at the time you make your pick.</li>
              <li>In the event of a push (spread met exactly), no points are awarded.</li>
              <li>You can only pick one game per week.</li>
              <li>Each week is independent (you can pick the same team multiple times across weeks).</li>
            </ol>

            <h3>Pick Deadlines</h3>
            <p>
              All picks must be submitted by 1:00 PM Eastern Time on Sunday of that NFL week.
              Once a game starts, that pick is locked and can no longer be changed.
            </p>

            <h3>Scoring</h3>
            <p>
              Points are calculated after each game ends. The total points accumulated throughout the season determine your position on the leaderboard.
            </p>
            
            <h3>Example</h3>
            <div className="bg-gray-50 p-4 rounded-md mb-4">
              <p className="font-medium">Week 1: Chiefs (+4.5) at Giants</p>
              <p>You pick the Chiefs (the underdog with a +4.5 spread).</p>
              <p>If the Chiefs win the game outright, you earn 4.5 points.</p>
              <p>If the Giants win, you earn 0 points.</p>
            </div>

            <h3>Tips for Success</h3>
            <ul>
              <li>Look for underdogs with a realistic chance to win outright.</li>
              <li>Consider home underdogs, which historically have a better chance of upsetting.</li>
              <li>Pay attention to injury reports and team news before making your selection.</li>
              <li>Bigger spreads offer more points but have a lower probability of winning.</li>
            </ul>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="prose">
            <div className="space-y-4">
              <div>
                <h4>What happens if there's a tie game?</h4>
                <p>If your selected underdog team ties, you receive no points as they did not win outright.</p>
              </div>
              
              <div>
                <h4>Can I change my pick after submitting?</h4>
                <p>Yes, you can change your pick any time before the game starts or before the Sunday 1 PM ET deadline, whichever comes first.</p>
              </div>
              
              <div>
                <h4>What if I forget to make a pick for a week?</h4>
                <p>If you don't submit a pick for a particular week, you receive 0 points for that week.</p>
              </div>
              
              <div>
                <h4>How are tiebreakers handled?</h4>
                <p>In the event of a tie in the final standings, the tiebreaker will be the number of correct picks made throughout the season.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
