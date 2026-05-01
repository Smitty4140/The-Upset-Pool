import * as cron from 'node-cron';
import { db } from './db.js';
import { golfTournaments } from '../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { pullGolfScoresFromESPN } from './golfDataPuller.js';
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

    // Run immediately on startup
    this.checkAndScheduleActiveTournaments();
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
