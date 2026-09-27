# Scheduled email reliability

## Why emails went out late, or not at all

The app is published as a Replit **autoscale** deployment (`.replit` →
`deploymentTarget = "autoscale"`). When nobody is using the site, autoscale
stops the instance. A stopped process runs no timers, so every `node-cron` job
in `server/scheduler.ts` is paused until someone's visit starts a new instance.
Even a running instance only reliably gets CPU while it is answering a request.

That explains both symptoms from Week 3 of 2026:

- **The "picks are open" email didn't go out.** Spreads come due Thursday
  around 12:15 PM ET, eight hours before the first kickoff. The pull and the
  email run in the background, after whichever request started the
  instance. The board could be written and then the instance frozen or
  stopped before the send loop finished. Any later retry also had to wait for
  an instance to be up at a ten-minute mark.
- **The one-hour warning arrived at 12:45, not 12:00.** The five-minute check
  didn't run at startup, so it only fired once an instance happened to be
  alive at a five-minute mark. In practice that was when members started
  loading the site to make picks. Separately, the window check used a strict
  `<`, so a tick at exactly 12:00:00 skipped a 1:00 lock. The earliest a
  perfect run could send was 12:05.

`.agents/memory/autoscale-scheduler-reliability.md` already recorded this
risk for the odds pull.

## The fix

`POST /api/cron/tick` (GET also works) runs everything time-critical:

- the spreads sweep, including the "picks are open" announcement
- the one-hour lock warning

It waits for the work to finish before it responds, so the instance keeps its
CPU until the emails are sent. It's safe to call as often as you want. The pull
policy and the `email_notifications` send log decide what is actually due, and
an in-process single-flight lock stops the tick and the internal cron from
overlapping and sending twice.

The internal cron is still there as a backup. The lock check now also runs on
startup, and its window includes 1:00 exactly.

## Setup (required: the code alone doesn't fix the timing)

1. In Replit, go to **Deployments → Secrets** and add `CRON_SECRET` with a
   long random value. Then republish. Until it's set, the endpoint answers
   `503`.
2. Create a job at an external scheduler such as
   [cron-job.org](https://cron-job.org) (free):
   - URL: `https://www.upsetpool.com/api/cron/tick`
   - Method: `POST`
   - Header: `Authorization: Bearer <CRON_SECRET>`
   - Schedule: every 5 minutes
   - Timeout: 60 seconds or more, because a tick that sends the Thursday email
     takes a while

   If a pinger only accepts a URL, use
   `https://www.upsetpool.com/api/cron/tick?key=<CRON_SECRET>`.

   Avoid GitHub Actions `schedule:` for this job. It regularly runs 10 to 30+
   minutes late.

The other option is to switch the deployment to a **Reserved VM**, which is
always on. That makes the in-process cron reliable without an external
pinger, but it costs a fixed monthly fee.

A successful tick responds like this:

```json
{ "ok": true, "at": "…", "spreads": [{ "weekNumber": 4, "picksUnlockedEmailsSent": 0 }],
  "lockWarnings": [] }
```

## Checking what actually went out

Every send, whether it succeeded or failed, has a row in
`email_notifications`. Run this against the production database to see what
happened in a given week:

```sql
SELECT n.kind, n.status, n.error, count(*) AS members,
       min(n.sent_at AT TIME ZONE 'America/New_York') AS first_et,
       max(n.sent_at AT TIME ZONE 'America/New_York') AS last_et
FROM email_notifications n
JOIN nfl_weeks w ON w.id = n.week_id
WHERE w.season = 2026 AND w.week_number = 3
GROUP BY 1, 2, 3
ORDER BY 1, 2;
```

Here's how to read the result:

- **No `picks_unlocked` rows** means the send never ran. The instance was
  stopped, or the send log was unreadable. For the second case, look for
  `board is up but the send log is unreadable` in the deployment logs.
- **`failed` rows** mean Brevo rejected the sends, and the `error` column says
  why. An "unrecognised IP address" 401 means Brevo's IP security blocked an
  autoscale instance's outbound IP. See
  `.agents/memory/brevo-email-credentials.md`.
