/**
 * Run the scheduler's due work from inside an HTTP request.
 *
 * The two incidents this exists for looked the same from the outside: the
 * week's spreads never posted, the "picks are open" email never went out, and
 * pressing the admin button fixed it in one click. The button is not special —
 * it is just the only code path that runs inside a request.
 *
 * Production is a Replit Autoscale deployment (`deploymentTarget =
 * "autoscale"` in .replit). Containers there are started to serve requests,
 * are frozen or CPU-starved between them, and are shut down entirely when the
 * site is quiet. `node-cron` is a `setTimeout` in that container, so a job
 * armed for Thursday at noon fires only if some container happens to be awake
 * and running at that minute. Often none is.
 *
 * So the work is kicked from the contexts that actually run:
 *
 *   1. Ordinary API traffic — one request every couple of minutes carries the
 *      tick, capped so it can never become the slow part of a page load.
 *   2. An external heartbeat POSTing /api/cron/tick, which is what covers the
 *      case that matters most: nobody is on the site, because nobody has been
 *      told the board is up yet.
 *   3. The in-process crons, when a container happens to be alive for them.
 *
 * Every job claims a database lease before doing anything (schedulerLease.ts),
 * so all of that adds up to one run per window, no matter how many containers
 * or requests are involved.
 */

import { timingSafeEqual } from 'crypto';
import type { LeaseSource } from './schedulerLease.js';

/** Don't even ask the database for a lease more often than this, per process. */
const MIN_ATTEMPT_GAP_MS = 60 * 1000;

/**
 * How long a request will wait for a tick before handing the response back and
 * letting the rest finish in the background. The tick is three small queries
 * when nothing is due; the budget only bites on the one tick a week that
 * actually pulls spreads and mails the league.
 */
const REQUEST_BUDGET_MS = Number(process.env.SCHEDULER_TICK_BUDGET_MS ?? 4000);

export interface TickSummary {
  source: LeaseSource;
  startedAt: string;
  finishedAt?: string;
  ran: boolean;
  /** Why a tick did nothing, when it did nothing. */
  skipped?: string;
  work?: unknown;
  error?: string;
}

let inFlight: Promise<TickSummary> | null = null;
let lastAttemptAt = 0;
let lastTick: TickSummary | null = null;

/** The most recent tick this container ran, for the admin scheduler page. */
export function getLastTick() {
  return lastTick;
}

/** Only for tests: forget this process's tick state. */
export function resetTickForTest() {
  inFlight = null;
  lastAttemptAt = 0;
  lastTick = null;
}

/**
 * Run every due job, unless this process just tried.
 *
 * `force` is for the heartbeat and the admin button: an explicit request to
 * check now skips the per-process gap, though the database leases still
 * decide whether there is anything to do.
 */
export async function runSchedulerTick(
  source: LeaseSource,
  options: { force?: boolean } = {},
): Promise<TickSummary> {
  if (inFlight) return inFlight;

  const now = Date.now();
  if (!options.force && now - lastAttemptAt < MIN_ATTEMPT_GAP_MS) {
    return { source, startedAt: new Date(now).toISOString(), ran: false, skipped: 'checked moments ago' };
  }
  lastAttemptAt = now;

  const startedAt = new Date(now).toISOString();
  inFlight = (async (): Promise<TickSummary> => {
    try {
      const { gameScheduler } = await import('./scheduler.js');
      const work = await gameScheduler.runDueWork(source);
      return { source, startedAt, finishedAt: new Date().toISOString(), ran: true, work };
    } catch (error) {
      // A tick must never take a request down with it.
      console.error('[SchedulerTick] Tick failed:', error);
      return {
        source,
        startedAt,
        finishedAt: new Date().toISOString(),
        ran: true,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      inFlight = null;
    }
  })();

  const summary = await inFlight;
  lastTick = summary;
  return summary;
}

/**
 * Kick a tick from a request and wait only as long as the budget allows.
 *
 * Waiting at all is deliberate: on Autoscale a promise left running after the
 * response can be frozen with the container, so work handed off "in the
 * background" may simply never finish. Holding the request open is what gives
 * the pull CPU. The budget keeps that from ever being more than a few seconds
 * of one page load, and whatever is left continues on the next request.
 */
export async function kickSchedulerTick(source: LeaseSource = 'request'): Promise<void> {
  try {
    const tick = runSchedulerTick(source);
    await Promise.race([
      tick,
      new Promise<void>(resolve => setTimeout(resolve, REQUEST_BUDGET_MS)),
    ]);
  } catch (error) {
    console.error('[SchedulerTick] Kick failed:', error);
  }
}

/** Express middleware: let ordinary traffic drive the scheduler. */
export function schedulerTickMiddleware() {
  return async (req: any, _res: any, next: any) => {
    // The heartbeat has its own endpoint, and it forces a tick; ticking here
    // too would just make it wait on itself.
    if (req.path.startsWith('/cron')) return next();
    // Tests import routes without a database behind them.
    if (process.env.VITEST || process.env.DISABLE_SCHEDULER_TICK === 'true') return next();
    await kickSchedulerTick('request');
    next();
  };
}

/**
 * Does a heartbeat caller's secret match the one this deployment expects?
 *
 * Constant time, and tolerant of different lengths: `timingSafeEqual` throws
 * on mismatched buffers, and that throw would itself leak the length.
 */
export function secretMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
