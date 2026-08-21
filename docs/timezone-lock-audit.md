# Timezone & Pick-Lock Audit

An end-to-end audit of when picks lock — per week (1:00 PM ET Sunday) and per
game (kickoff) — across daylight-saving transitions. Every conversion below
was verified by *executing* the code's logic in Node against real DST
boundary dates, not just by reading it.

Audited: `server/timezoneUtils.ts`, `server/routes.ts` (pick submission,
picks-hidden gates, admin lock/unlock), `server/scheduler.ts`,
`server/seedData.ts` (2025), `server/seed2026Schedule.ts` +
`scripts/seed-2026-nfl-schedule.mjs` (2026), `server/storage.ts`
(current-week selection), and the client's lock displays.

---

## Verified correct (no changes needed)

**`easternTimeToUTC` / `getPicksLockTimeForSunday`** — the core conversion
tries both the EDT and EST offset for the requested wall-clock time and keeps
whichever round-trips to the requested hour in `America/New_York`. Executed
against the hard cases and correct on all of them, including the transition
Sundays themselves:

| Date | Stored UTC | Displays as |
| --- | --- | --- |
| Sep 7 2025 (EDT) | 17:00Z | 1:00 PM EDT ✓ |
| Nov 2 2025 (DST ends that morning) | 18:00Z | 1:00 PM EST ✓ |
| Jan 4 2026 (EST) | 18:00Z | 1:00 PM EST ✓ |
| Nov 1 2026 (DST ends that morning) | 18:00Z | 1:00 PM EST ✓ |
| Mar 8 2026 (DST starts) | 17:00Z | 1:00 PM EDT ✓ |

The 1 PM target never falls inside the 1–3 AM ambiguous/skipped window, so
the transition days themselves are safe.

**Server-side enforcement** (`POST /api/user/pick`) — all three lock layers
compare stored UTC instants against server `now`, so a client clock can't
bypass any of them:
1. Week lock: rejects once `now > week.picksLockAt`.
2. Game lock: rejects a pick for any game whose kickoff has passed.
3. Lock-in: rejects *changing* a pick once the previously-picked game has
   kicked off.

**Picks-hidden gates** — every route that reveals other players' picks
(`/week/:id/picks`, leaderboard pick history) checks `picksLockAt < now`
against the same stored UTC value. Consistent with the lock.

**2025 season data** (`seedData.ts`) — hardcoded values checked row by row:
17:00Z through Oct 26, 18:00Z from Nov 2 on. Nov 2 2025 *was* the DST-end
day, and it's on the correct side. All 18 weeks correct.

**Scheduler** — one-shot cron expressions are built from the target
instant's *ET wall-clock* components and registered with
`timezone: 'America/New_York'`; the two halves agree, so spread pulls
(8 hours before the first kickoff) and results pulls fire at the right
moment on either side of a DST change. Fixed-window crons (Sunday 1–11 PM
ET results sweep, Sunday-noon emails) also carry the ET timezone option.
Missed jobs are recovered by the hourly re-check, which pulls immediately
when a pull time has passed, guarded against double-pulling.

---

## Bugs found and fixed

### 1. The 2026 seeders locked weeks 8 and 9 an hour early

Both seeder copies (`server/seed2026Schedule.ts` and
`scripts/seed-2026-nfl-schedule.mjs`) hardcoded the DST boundary:
`weekNum <= 9 ? 4 : 5` (EDT through week 9). But DST ends **Nov 1, 2026 —
week 8's Sunday**. Executed proof: weeks 8 and 9 stored 17:00Z, which is
**noon EST**, an hour before the advertised 1 PM ET deadline. Wrong in the
"safe" direction (early, not late), but wrong.

### 2. The 2026 seeders locked week 1 a full week early — before kickoff

The seeders scanned *forward* from each week's start date for the first
Sunday. Week 1's ESPN window is `2026-09-06` → `2026-09-15` and opens on the
Sunday **before** kickoff (the season starts Thursday Sep 10; the game Sunday
is Sep 13). The scan found Sep 6 and stored the lock there — **four days
before the first game exists**, and before spreads would ever be pulled.
As seeded, week 1 could never be picked by anyone.

### 3. The admin lock/unlock endpoint had the same first-Sunday scan

`PATCH` unlock recomputed the lock by scanning forward from the week's start
date, so "unlocking" week 1 would have re-locked it to Sep 6. It also used
server-local `getDay()`/`getDate()` on the scanned date.

### The fix, in all three places

The lock Sunday is now the **last** Sunday in the week's window (scanned in
UTC, so it's independent of server timezone — a date-only string has a fixed
weekday), and the ET offset comes from `easternTimeToUTC` for that actual
date instead of a hardcoded week boundary. Executed against all 18 weeks of
the 2026 calendar: every week now stores exactly 1:00 PM ET (17:00Z through
week 7, 18:00Z from week 8 on), week 1 locks on Sep 13, and the seeder and
the admin endpoint agree on every week.

### Repairing already-seeded production data

The code fix doesn't touch rows that were already seeded. A new super-user
endpoint audits and repairs them:

```
GET /api/admin/system/fix-lock-times              # report only, writes nothing
GET /api/admin/system/fix-lock-times?apply=true   # writes the corrections
```

It recomputes the correct lock for every stored regular-season week — from
the week's *actual games* when they exist (earliest kickoff on an
Eastern-Time Sunday, so a Sunday-night game that is already Monday in UTC
still counts as Sunday), falling back to the calendar window — and reports
`stored` vs `correct` per week. Run it without `apply` first and eyeball the
report; expected drift for 2026 as previously seeded is week 1
(`09-06T17:00Z → 09-13T17:00Z`) and weeks 8–9 (`17:00Z → 18:00Z`).

Also fixed while in there: the pick-rejection message claimed spreads arrive
"12 hours before the first game"; the scheduler pulls at 8 hours. It now
says 8.

---

## Known fragilities (documented, not changed)

These are correct today but worth knowing about:

- **Naive timestamps assume a UTC server.** `game_time` and `picks_lock_at`
  are `timestamp` *without* time zone. Every writer binds a JS `Date`
  (node-postgres serializes it in the process's local zone) and every reader
  parses it back the same way, so the system is consistent as long as the
  server process runs in UTC — which Replit deployments do. If the app ever
  moves to a host with a non-UTC system timezone, every stored instant
  silently shifts. Hardening options: set `TZ=UTC` explicitly in the deploy
  environment (cheap), or migrate the columns to `timestamptz` (thorough).
- **"Current week" flips a few hours early in ET.** `getCurrentNFLWeek`
  compares the UTC calendar date against the week's date range, so between
  ~8 PM ET and midnight ET the "current" week can advance to the next week a
  few hours before the ET calendar does. Harmless for locking — the old
  week's lock has long passed and the new week can't be picked until spreads
  post — but it explains why the site can show next week on a Tuesday
  evening.
- **The client shows lock state; the server enforces it.** The client's
  countdown and disabled cards use the same stored UTC values, so they
  agree with the server, but even a client with a wrong clock can't submit
  past a deadline — every path is re-checked server-side.
