# Why the spreads did not pull, and what now makes them

## What happened

Twice now the week's spreads stayed empty until an admin pressed **Pull
Spreads** in the site admin, and because the board never went up on its own,
the "picks are open" email never went out either. The pull itself was never
broken: the moment a human asked for it, it worked on the first try.

That is the whole diagnosis. The button works because it runs inside an HTTP
request. Nothing else did.

## The cause

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
is usually idle, so there is no process, so nothing fires. Nobody is on the site
because nobody has been told the board is up; the email that would tell them is
the thing that did not send. The whole automation was waiting for traffic that
its own output was supposed to create.

Switching the deployment to a Reserved VM would also fix this (a VM runs all the
time, so the crons are real), at the cost of a always-on instance. The approach
below keeps Autoscale.

## The fix

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
reports, for each job, when it last ran, what kicked it, and what it found:

```json
{
  "leases": [
    { "job": "spreads", "lastRunAt": "2026-09-17T16:02:11Z", "lastSource": "heartbeat",
      "lastResult": "W3 due 0/16; W4 waiting 0/0 (heartbeat)" }
  ],
  "heartbeatConfigured": true
}
```

That is read from the database, so it survives container recycles. Start there:

- **`lastRunAt` is hours old** → nothing is kicking the app. Check the heartbeat
  (workflow runs, pinger, `CRON_SECRET` set on both ends).
- **It ran, and `lastResult` says `waiting`** → the trigger time has not arrived.
  `pullAt` in the same response says when it will.
- **`throttled`** → it pulled within the last 30 minutes and will try again.
- **`exhausted`** → 12 attempts failed. `GET /api/admin/system/preflight/spreads`
  says why (API key, quota, no lines posted yet), then pull by hand.
- **Board is up but no email** → the send log. `email_notifications` has a row
  per member per week, with the failure reason when Brevo rejected one.
