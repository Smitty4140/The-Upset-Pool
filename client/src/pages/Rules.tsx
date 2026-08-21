import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Rules() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">League Rules</h1>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>How the Upset Pool Works</CardTitle>
            <CardDescription>Everything you need to know to play</CardDescription>
          </CardHeader>
          <CardContent className="prose">
            <h3>Basic Rules</h3>
            <ol>
              <li>Each week of the NFL regular season, you select one underdog team to win outright.</li>
              <li>Only underdogs can be picked. On each game card the underdog is the team carrying a plus number, and choosing the card selects that team.</li>
              <li>If your selected underdog wins, you earn points equal to the spread value.</li>
              <li>You pick only one game per week, though that pick can be updated until 1:00 PM ET Sunday or until your selected game starts, whichever comes first.</li>
              <li>Each week is independent — you can pick the same team in as many weeks as you like.</li>
            </ol>

            <h3>Pick Deadlines</h3>
            <p>
              All picks must be submitted by 1:00 PM Eastern Time on Sunday of that NFL week.
              If a game starts before that time (e.g. Thursday night), picks for that game lock at kickoff and cannot be updated.
            </p>

            <h3>Scoring</h3>
            <p>
              Your underdog has to <strong>win its game</strong>. Covering the
              spread earns nothing — this is not a spread pool. Points are
              calculated once each game ends, and your season total sets your
              place on the leaderboard.
            </p>
            
            <h3>Example</h3>
            <div className="bg-gray-50 p-4 rounded-md mb-4">
              <p className="font-medium">Panthers (+6.5) at Chiefs</p>
              <p>The Panthers are the underdog, so they are the only side of this game you can pick.</p>
              <p>Panthers win the game &rarr; you earn <strong>6.5 points</strong>.</p>
              <p>Panthers lose by 3 &rarr; <strong>0 points</strong>, even though they beat the spread.</p>
              <p>Game ends in a tie &rarr; <strong>0 points</strong>.</p>
            </div>

            <h3>Prizes</h3>
            <p>
              Three ways to finish in the money. Amounts are set by your league
              commissioner and are not final yet:
            </p>
            <ul>
              <li>The top 5 places earn a payout.</li>
              <li>Pick every single week and you're entered into an end-of-season drawing — miss one week and you're out of it.</li>
              <li>Finish in the top half of the league for entry into a second end-of-season drawing.</li>
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
