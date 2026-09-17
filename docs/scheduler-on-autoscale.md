# Why the spreads did not pull, and how to tell next time

## What happened

Twice now the week's spreads stayed empty until an admin pressed the pull
button in the site admin, and because the board never went up on its own, the
"picks are open" email never went out either. The pull itself was never broken:
the moment a human asked for it, it worked on the first try.

There are exactly two ways that happens, and they need different fixes:

1. **Nothing ran.** No container was awake to run the sweep at the moment the
   week came due.
2. **The sweep ran and decided not to pull** — or pulled and wrote nothing.

The second is the more likely one when someone was on the site around that
time, because a visit wakes a container and the sweep runs on startup as well
as every ten minutes. Both are addressed below, and the admin Scheduler card
now says plainly which one you are looking at.

## Failure mode 1: nothing ran

`.replit` deploys this app to **Replit Autoscale**:

```
[deployment]
deploymentTarget = "autoscale"
```

An Autoscale container exists to serve requests. It is started when traffic
arrives, gets little or no CPU between requests, and is shut down entirely when
the site is quiet. Containers are also recycled constantly, so anything held in
memory is typically minutes old.

The scheduler was a set of `node-cron` timers inside that container:

```js
cron.schedule('*/10 * * * *', () => this.sweepSpreadPulls());
```

A timer is a `setTimeout` in a process. It fires only if that process is awake
and running at that minute. On Thursday around noon ET — eight hours before the
first kickoff, which is when spreads post and the league gets mailed — the site
can easily be idle, so there is no process, so nothing fires. And nobody is on
the site because nobody has been told the board is up: the email that would tell
them is the thing that did not send. The automation was waiting on traffic that
its own output was supposed to create.

This is a real gap whether or not it caused either incident. If someone *was* on
the site when a week came due, a container was awake and this is not the
explanation — see failure mode 2.

Switching the deployment to a Reserved VM would also fix this (a VM runs all the
time, so the crons are real), at the cost of an always-on instance. The approach
below keeps Autoscale.

### The fix

The same jobs are now kicked from the contexts that actually run on Autoscale:

1. **Ordinary API traffic.** `schedulerTickMiddleware` (`server/schedulerTick.ts`)
   runs on `/api` requests. A request waits at most a few seconds for it
   (`SCHEDULER_TICK_BUDGET_MS`, default 4000) and never fails because of it.
2. **An external heartbeat.** `POST /api/cron/tick` runs the due work on
   demand. This is the one that covers a quiet site.
3. **The in-process crons**, unchanged, for whenever a container is up.
4. **Startup**, as before, so a cold start catches up.

All four paths go through `gameScheduler.runDueWork()`, and every job inside it
claims a lease in the `scheduler_leases` table before doing anything:

```sql
INSERT INTO scheduler_leases (job, last_run_at, last_source)
VALUES ($job, now(), $source)
ON CONFLICT (job) DO UPDATE SET last_run_at = now(), last_source = $source
 WHERE scheduler_leases.last_run_at < now() - make_interval(secs => $window)
RETURNING job
```

Postgres serializes that statement, so in any window exactly one caller gets a
row back and does the work; everyone else gets nothing and returns immediately.
A thousand requests a minute still mean one spread sweep every five minutes, one
Odds API call, one email to the league.

Windows are in `server/scheduler.ts`: spreads 5 min, lock warnings 4 min,
results 20 min. The per-week rules (when a week is due, the 30-minute retry, the
12-attempt budget) are unchanged and still live in `spreadPullPolicy.ts`.

If `scheduler_leases` does not exist yet, claims fall back to a per-process
lease and log what to run. Jobs still happen; two containers might briefly
duplicate one. The email send log (`email_notifications`) still keeps members
from being mailed twice.

## Failure mode 2: it ran and did not pull

The sweep asks `decideSpreadPull` (`server/spreadPullPolicy.ts`) about each
upcoming week, and only one of its answers pulls:

| Status | Meaning | Why the board can stay empty |
| --- | --- | --- |
| `complete` | every game has a line | — |
| `locked` | picks already closed | a board that opened too late is never filled |
| `waiting` | the trigger has not arrived | the trigger is **8 hours before the earliest kickoff already in the database**, so a week whose Thursday game was never seeded waits until Sunday morning instead |
| `throttled` | pulled within the last 30 minutes | temporary, by design |
| `exhausted` | past its fast-retry budget | **this one used to be permanent** |
| `due` | pulls now | — |

`exhausted` was the dead end. After 12 failed attempts the week stopped being
pulled by anything except a restart or an admin pressing the button — so a book
that posted its lines an hour late, or an API hiccup during the trigger window,
left the board empty for the rest of the week with only a single line in the
logs to say so. That is what "it got stuck" looks like from the outside.

It now backs off instead of stopping: 12 attempts at 30 minutes, then one every
two hours until the week locks (`SPREAD_PULL_SLOW_RETRY_MS`). Worst case that is
about 20 requests a day for a week that cannot be filled, against a season quota
in the thousands, and the status still reads `exhausted` so an admin knows to
look. The status line and `GET /api/admin/system/preflight/spreads` say why the
attempts are failing — a team name that does not map, a kickoff that buckets
outside the week's date range, no lines posted yet, a quota wall.

## Setup

One secret, then something to call the endpoint.

**1. Replit → Secrets**

```
CRON_SECRET = <a long random string>
```

Without it, `/api/cron/tick` returns 503 and says so, and the admin page shows
an amber "no heartbeat is configured" line.

**2. Run the migration**

```
npm run db:push
```

Creates `scheduler_leases`.

**3. Point something at the endpoint** (pick one)

- **The GitHub Actions workflow in this repo** —
  `.github/workflows/scheduler-heartbeat.yml`. Add `CRON_SECRET` (same value) to
  the repository's Actions secrets, and optionally `SCHEDULER_TICK_URL` if the
  production URL ever changes. Its schedule is clustered around Thursday noon,
  Sunday, and the Sunday/Monday night result windows rather than running around
  the clock, because scheduled runs on a private repository bill against the
  account's Actions minutes.
- **A Replit Scheduled Deployment** running
  `curl -fsS -X POST "$TICK_URL" -H "x-cron-secret: $CRON_SECRET"`.
- **Any uptime pinger** (cron-job.org, UptimeRobot) that can send a custom
  header, every 10–15 minutes.

Calling it more often than needed is harmless — the leases absorb it.

```bash
curl -i -X POST https://www.upsetpool.com/api/cron/tick -H "x-cron-secret: $CRON_SECRET"
```

## Diagnosing the next one

`GET /api/admin/scheduler/status` (and the Scheduler card in the site admin) now
answers both questions: when each job last ran (from the database, so it
survives container recycles), and what the sweep decides about each upcoming
week *right now*, computed on request rather than remembered:

```json
{
  "leases": [
    { "job": "spreads", "lastRunAt": "2026-09-17T16:02:11Z", "lastSource": "heartbeat",
      "lastResult": "W3 due 0/16 (heartbeat)" }
  ],
  "spreadPulls": [
    { "weekNumber": 3, "status": "waiting", "pullAt": "Sep 20, 2026, 05:00 AM",
      "firstKickoff": "Sep 20, 2026, 01:00 PM", "gamesWithSpreads": 0, "gamesTotal": 14,
      "attemptsThisInstance": 0, "lastTouchedAt": "Sep 1, 2026, 12:00 AM" }
  ],
  "heartbeatConfigured": true
}
```

Read it in this order:

- **`leases.spreads.lastRunAt` is hours old** → nothing is kicking the app
  (failure mode 1). Check the heartbeat: workflow runs, pinger, `CRON_SECRET`
  set on both ends.
- **It ran recently, and the week says `waiting`** → the trigger has not
  arrived. Compare `pullAt` with `firstKickoff`: the example above is the giveaway
  that the Thursday game is missing from the schedule, which pushed the trigger
  to Sunday morning. Seed the missing game, or pull by hand.
- **`throttled`** → it pulled within the last 30 minutes and will try again.
- **`exhausted`** → the fast-retry budget is spent and it is now retrying every
  two hours. `GET /api/admin/system/preflight/spreads` says why the attempts are
  failing — it reports every game the API returned, which ones bucket into the
  week, and which were excluded and for what reason.
- **The week is not listed at all** → its `end_date` is in the past, so the
  sweep does not consider it upcoming. Fix the week's dates.
- **Board is up but no email** → the send log. `email_notifications` has a row
  per member per week, with the failure reason when Brevo rejected one.

The deployment logs are the other primary source, and the lines are distinctive:
`[Scheduler] ⏰ Week N spreads are due` (it pulled), `[NFLDataPuller] Could not
find week for game at ...` (the kickoff bucketed outside every week's date
range), `[Scheduler] ⚠️  Week N has spent its fast-retry budget`.
