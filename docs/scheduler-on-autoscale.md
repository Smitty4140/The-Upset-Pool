# Why the board sat on "Any moment now"

## What happened

The countdown on the league header reached zero, the header switched to "Any
moment now", and the spreads did not appear. After three to five minutes an
admin pressed **Pull NFL Games from API** in the site admin; the board went up
immediately, and the league still got no "picks are open" email.

Three separate things are in that one sentence.

## 1. The sweep only ran every ten minutes

The header says "Any moment now" the instant the countdown expires. The server
swept for due weeks every ten minutes. So the gap between the promise and the
lines going up was anywhere from a few seconds to ten minutes, and there was no
way for anyone watching to tell a slow sweep from a broken one. Three to five
minutes of it is enough to reach for the manual button — which is what happened,
and why the automation never got the chance to prove it worked.

The sweep now runs every minute (`SPREAD_SWEEP_LEASE_MS`), and it is cheap
enough to do that: it reads every upcoming week's games in one batched query
instead of one query per week.

Sweeping more often does not mean asking The Odds API more often. Those are two
different limits, and only the second one costs money:

- **Sweeping** — deciding whether any week is due — is two queries, every minute.
- **Pulling** — calling the Odds API for a week — still happens at most once
  every 30 minutes per week, and that interval is now durable. It used to rely
  on an in-memory counter plus the `updated_at` on the week's game rows, which
  says nothing at all about a week with no games yet: exactly the week the
  fallback trigger exists for. Each week now claims its own
  `spread-pull:w<id>` lease before the request goes out, so a week that keeps
  failing costs one request per window across every container, not one per
  sweep.

The page helps too: while the header reads "Any moment now" it re-checks twice a
minute, and each of those requests is itself what kicks the server's sweep
(see 3 below). Sitting on the page waiting is now the thing that makes the
spreads appear.

## 2. The admin pull button never sent the email

There are two admin pull paths, and they behaved differently:

| Route | Posts spreads | Tells the league |
| --- | --- | --- |
| `POST /api/admin/pull-games` | yes | yes |
| `POST /api/admin/games/fetch-from-api` — **the button in the admin UI** | yes | **no** |

So the one an admin actually reaches for when the automation looks late was the
one path that could put a whole board up in silence. `fetch-from-api` now
announces through the same gate as everything else (`announcePicksUnlockedIfDue`),
which counts posted spreads either side of the pull so it only announces a board
that actually went from empty to up, and never mails a week the league has
already been told about.

## 3. Nothing runs when nothing is awake
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

This did not cause the incident above — someone was on the site, so a container
was awake — but it is a real gap on any quiet Thursday, and the fix is also what
makes point 1 work: a request is now a thing that drives the scheduler.

Switching the deployment to a Reserved VM would also fix this (a VM runs all the
time, so the crons are real), at the cost of an always-on instance. The approach
below keeps Autoscale.

### The fix — requests drive the scheduler

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
A thousand requests a minute still mean one spread sweep a minute, one Odds API
call per week per 30 minutes, one email to the league.

Windows are in `server/scheduler.ts`: spreads 1 min, lock warnings 4 min,
results 20 min, plus the per-week `spread-pull:w<id>` window that rations the
Odds API itself (30 minutes, or 2 hours once a week is over budget). When a week
is due, the rules for what to do about it still live in `spreadPullPolicy.ts`.

If `scheduler_leases` does not exist yet, claims fall back to a per-process
lease and log what to run. Jobs still happen; two containers might briefly
duplicate one. The email send log (`email_notifications`) still keeps members
from being mailed twice.

## 4. A week that gave up stayed given up

The sweep asks `decideSpreadPull` (`server/spreadPullPolicy.ts`) about each
upcoming week, and only one of its answers pulls:

| Status | Meaning |
| --- | --- |
| `complete` | every game has a line |
| `locked` | picks already closed |
| `waiting` | the trigger has not arrived — it is 8 hours before the **earliest kickoff already in the database**, so a week whose Thursday game was never seeded waits until Sunday morning |
| `throttled` | pulled within the last 30 minutes |
| `exhausted` | past its fast-retry budget |
| `due` | pulls now |

`exhausted` used to be permanent: after 12 failed attempts the week was never
pulled again by anything but a restart or an admin. A book posting its lines an
hour late could therefore strand a board for the rest of the week. It now backs
off instead of stopping — 12 attempts at 30 minutes, then one every two hours
until the week locks (`SPREAD_PULL_SLOW_RETRY_MS`) — while still reading
`exhausted` so an admin knows something is wrong.

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
- **It ran within the last couple of minutes and the week says `waiting`** →
  the trigger has not arrived. Compare `pullAt` with `firstKickoff`: the example above is the giveaway
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
