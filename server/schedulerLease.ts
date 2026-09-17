/**
 * The lease that makes a time-driven job safe to kick from anywhere.
 *
 * Production runs on Replit Autoscale. A container there exists to serve
 * requests: it is started when traffic arrives, gets little or no CPU between
 * requests, and is shut down entirely when the site is quiet. An in-process
 * `node-cron` timer set for Thursday noon only fires if some container happens
 * to be awake and running that exact minute, which is why the spreads have
 * twice now waited for an admin to press the button — the button is an HTTP
 * request, and a request is the one context that reliably runs.
 *
 * So the same jobs are kicked from several places: the crons (when a container
 * is up), ordinary API traffic, an external heartbeat, and startup. Each
 * caller claims a lease first, and the claim is one conditional UPSERT:
 *
 *   INSERT ... ON CONFLICT DO UPDATE ... WHERE last_run_at < now() - interval
 *
 * Postgres serializes that, so within a window exactly one caller gets a row
 * back and every other caller gets nothing and returns. No double pulls
 * against the Odds API, no double email.
 *
 * If the table is missing — `npm run db:push` not run yet — this degrades to a
 * per-process lease rather than throwing: a late email beats no email, and the
 * send log still dedupes members.
 */

import { sql } from 'drizzle-orm';
import { db } from './db.js';

export type LeaseJob =
  | 'spreads'
  | 'lock-warnings'
  | 'results'
  /** One per week: the durable "don't call the Odds API again yet" record. */
  | `spread-pull:w${number}`;

/** The lease key for a week's Odds API attempts. */
export function spreadPullLeaseKey(weekId: number): LeaseJob {
  return `spread-pull:w${weekId}`;
}

/** Who kicked a run — recorded so the admin page can say where work came from. */
export type LeaseSource = 'cron' | 'startup' | 'request' | 'heartbeat' | 'admin';

/** Per-process fallback for when scheduler_leases cannot be reached. */
const memoryLeases = new Map<string, number>();
let leaseTableAvailable = true;
let missingTableLogged = false;

/** Whether the durable lease table is usable, for the admin status endpoint. */
export function isLeaseTableAvailable() {
  return leaseTableAvailable;
}

/** Only for tests: forget the in-process fallback state. */
export function resetLeasesForTest() {
  memoryLeases.clear();
  leaseTableAvailable = true;
  missingTableLogged = false;
}

/**
 * Claim `job` for the next `minIntervalMs`.
 *
 * True means this caller owns the run and must do the work. False means
 * someone else already ran it recently — the caller returns without working.
 */
export async function claimSchedulerLease(
  job: LeaseJob,
  minIntervalMs: number,
  source: LeaseSource,
): Promise<boolean> {
  const seconds = minIntervalMs / 1000;
  try {
    const result: any = await db.execute(sql`
      insert into scheduler_leases (job, last_run_at, last_source, last_finished_at)
      values (${job}, now(), ${source}, null)
      on conflict (job) do update
        set last_run_at = now(), last_source = ${source}, last_finished_at = null
        where scheduler_leases.last_run_at < now() - make_interval(secs => ${seconds})
      returning job
    `);
    leaseTableAvailable = true;
    const rows = result?.rows ?? result ?? [];
    return Array.isArray(rows) ? rows.length > 0 : Number(result?.rowCount ?? 0) > 0;
  } catch (error) {
    // Almost always "relation scheduler_leases does not exist". Degrade to a
    // per-process lease: several instances may then do the same sweep, which
    // the spread policy's own retry window and the email send log both absorb.
    leaseTableAvailable = false;
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.error(
        `[SchedulerLease] ⚠️  Cannot use scheduler_leases (run "npm run db:push"). ` +
        `Falling back to a per-process lease — jobs still run, but two instances ` +
        `could run the same sweep. Error:`, error
      );
    }
    const last = memoryLeases.get(job) ?? 0;
    if (Date.now() - last < minIntervalMs) return false;
    memoryLeases.set(job, Date.now());
    return true;
  }
}

/**
 * Record what a claimed run did. Best effort: a lost summary line costs an
 * admin some context, never the run itself.
 */
export async function finishSchedulerLease(job: LeaseJob, summary: string) {
  if (!leaseTableAvailable) return;
  try {
    await db.execute(sql`
      update scheduler_leases
         set last_result = ${summary.slice(0, 500)}, last_finished_at = now()
       where job = ${job}
    `);
  } catch (error) {
    console.error(`[SchedulerLease] Could not record the outcome of "${job}":`, error);
  }
}

/**
 * Forget a lease, so the next caller claims it immediately.
 *
 * For an admin saying "do it now": a human asking again is a reason to try
 * again, not to wait out a window meant for unattended retries.
 */
export async function releaseSchedulerLease(job: LeaseJob) {
  memoryLeases.delete(job);
  if (!leaseTableAvailable) return;
  try {
    await db.execute(sql`delete from scheduler_leases where job = ${job}`);
  } catch (error) {
    console.error(`[SchedulerLease] Could not release "${job}":`, error);
  }
}

export interface SchedulerLeaseRow {
  job: string;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  lastSource: string | null;
  lastResult: string | null;
}

/**
 * Every job's last run, for the admin scheduler page. This is the line that
 * answers "did the automation run at all?" — the question nobody could answer
 * from in-memory state after an autoscale container had been recycled.
 */
export async function readSchedulerLeases(): Promise<SchedulerLeaseRow[]> {
  try {
    const result: any = await db.execute(sql`
      select job, last_run_at, last_finished_at, last_source, last_result
        from scheduler_leases
       order by job
    `);
    const rows = (result?.rows ?? result ?? []) as any[];
    leaseTableAvailable = true;
    return rows.map(row => ({
      job: row.job,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : null,
      lastFinishedAt: row.last_finished_at ? new Date(row.last_finished_at).toISOString() : null,
      lastSource: row.last_source ?? null,
      lastResult: row.last_result ?? null,
    }));
  } catch (error) {
    leaseTableAvailable = false;
    console.error('[SchedulerLease] Could not read scheduler_leases:', error);
    return [];
  }
}
