import * as cron from 'node-cron';
import { db } from './db.js';
import { golfTournaments } from '../shared/schema.js';
import { eq, and, gt, lte, isNotNull } from 'drizzle-orm';
import { pullGolfScoresFromESPN, pullGolfFieldFromOddsAPI, enrichGolfFieldWithESPNPhotos, enrichGolfFieldWithDataGolfOWGR } from './golfDataPuller.js';
import type { IStorage } from './storage.js';

class GolfScheduler {
  private activeJobs: Map<number, cron.ScheduledTask> = new Map();
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
    console.log('[GolfScheduler] Initializing Golf Score Scheduler');
  }

  /**
   * Start the scheduler.
   * On boot, schedule hourly polling for any tournament already marked active.
   * Every hour also re-checks for newly activated tournaments.
   */
  start() {
    console.log('[GolfScheduler] Starting golf scheduler');

    // Re-check every hour for new active tournaments
    cron.schedule('5 * * * *', async () => {
      await this.checkAndScheduleActiveTournaments();
    });

    // Every Sunday at 8:00 AM ET: auto-pull field + odds for any tournament
    // starting within the next 7 days (the week ahead).
    cron.schedule('0 8 * * 0', async () => {
      await this.pullUpcomingTournamentFields();
    }, { timezone: 'America/New_York' });

    // Run immediately on startup
    this.checkAndScheduleActiveTournaments();
  }

  /**
   * Find tournaments starting within the next 7 days and pull their field + odds.
   * After a successful pull, status is set to 'active' so picks become available.
   */
  async pullUpcomingTournamentFields(): Promise<{ pulled: { id: number; name: string }[]; failed: { id: number; name: string; error: string }[]; skipped: boolean }> {
    const pulled: { id: number; name: string }[] = [];
    const failed: { id: number; name: string; error: string }[] = [];

    try {
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const upcoming = await db
        .select()
        .from(golfTournaments)
        .where(
          and(
            eq(golfTournaments.status, 'upcoming'),
            gt(golfTournaments.startsAt, now),
            lte(golfTournaments.startsAt, sevenDaysFromNow),
            isNotNull(golfTournaments.oddsApiSportKey)
          )
        );

      if (upcoming.length === 0) {
        console.log('[GolfScheduler] Sunday check: no upcoming tournaments in next 7 days');
        return { pulled, failed, skipped: true };
      }

      for (const t of upcoming) {
        console.log(`[GolfScheduler] ⏰ Sunday auto-pull: pulling field + odds for "${t.name}" (id=${t.id})`);
        try {
          await pullGolfFieldFromOddsAPI(t.id, this.storage);
          await db.update(golfTournaments)
            .set({ status: 'active', updatedAt: new Date() })
            .where(eq(golfTournaments.id, t.id));
          console.log(`[GolfScheduler] ✅ Field pulled + status → active for "${t.name}"`);

          // Enrich with ESPN photos — non-blocking
          enrichGolfFieldWithESPNPhotos(t.id, this.storage).then(r => {
            console.log(`[GolfScheduler] ✅ ESPN photos enriched for "${t.name}" — updated: ${r.updated}, skipped: ${r.skipped}`);
          }).catch(err => {
            console.error(`[GolfScheduler] ⚠ ESPN photo enrichment failed for "${t.name}":`, err?.message);
          });

          // Enrich with DataGolf OWGR — non-blocking
          enrichGolfFieldWithDataGolfOWGR(t.id, this.storage).then(r => {
            console.log(`[GolfScheduler] ✅ DataGolf OWGR enriched for "${t.name}" — updated: ${r.updated}, skipped: ${r.skipped}`);
          }).catch(err => {
            console.error(`[GolfScheduler] ⚠ DataGolf OWGR enrichment failed for "${t.name}":`, err?.message);
          });

          pulled.push({ id: t.id, name: t.name });
        } catch (err: any) {
          console.error(`[GolfScheduler] ❌ Failed to pull field for "${t.name}":`, err);
          failed.push({ id: t.id, name: t.name, error: err?.message || 'Unknown error' });
        }
      }
    } catch (err) {
      console.error('[GolfScheduler] Error in Sunday field pull:', err);
    }

    return { pulled, failed, skipped: false };
  }

  /**
   * Find all active tournaments with an ESPN event ID and schedule hourly polling.
   */
  async checkAndScheduleActiveTournaments() {
    try {
      const active = await db
        .select()
        .from(golfTournaments)
        .where(and(eq(golfTournaments.status, 'active')));

      for (const t of active) {
        if (t.espnEventId && !this.activeJobs.has(t.id)) {
          this.scheduleHourlyPoll(t.id, t.name);
        }
      }
    } catch (err) {
      console.error('[GolfScheduler] Error checking active tournaments:', err);
    }
  }

  /**
   * Schedule an hourly polling job for a specific tournament.
   */
  scheduleHourlyPoll(tournamentId: number, name: string) {
    if (this.activeJobs.has(tournamentId)) {
      console.log(`[GolfScheduler] Already polling tournament ${tournamentId}`);
      return;
    }

    console.log(`[GolfScheduler] Scheduling hourly poll for "${name}" (id=${tournamentId})`);

    const job = cron.schedule('0 * * * *', async () => {
      await this.executePoll(tournamentId, name);
    });

    this.activeJobs.set(tournamentId, job);

    // Also run immediately when first scheduled
    this.executePoll(tournamentId, name);
  }

  /**
   * Cancel the polling job for a tournament (called after it completes).
   */
  cancelPoll(tournamentId: number) {
    const job = this.activeJobs.get(tournamentId);
    if (job) {
      job.destroy();
      this.activeJobs.delete(tournamentId);
      console.log(`[GolfScheduler] Cancelled polling job for tournament ${tournamentId}`);
    }
  }

  /**
   * Execute a single ESPN score poll.
   * If ESPN reports the event is finished ('post'), marks tournament completed and stops polling.
   */
  private async executePoll(tournamentId: number, name: string) {
    try {
      console.log(`[GolfScheduler] ⏰ Polling ESPN scores for "${name}" (id=${tournamentId})`);
      const result = await pullGolfScoresFromESPN(tournamentId, this.storage);

      console.log(`[GolfScheduler] ✅ Poll complete — state: ${result.espnState}, matched: ${result.matched}, skipped: ${result.skipped}`);

      if (result.espnState === 'post') {
        // Tournament is over — mark completed and stop polling
        await db.update(golfTournaments)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(golfTournaments.id, tournamentId));
        console.log(`[GolfScheduler] Tournament "${name}" completed — cancelling polling job`);
        this.cancelPoll(tournamentId);
      }
    } catch (err) {
      console.error(`[GolfScheduler] ❌ Error polling tournament ${tournamentId}:`, err);
    }
  }

  getActiveJobIds(): number[] {
    return Array.from(this.activeJobs.keys());
  }
}

export let golfScheduler: GolfScheduler;

export function startGolfScheduler(storage: IStorage) {
  golfScheduler = new GolfScheduler(storage);
  golfScheduler.start();
}
