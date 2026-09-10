import * as cron from 'node-cron';
import { db } from './db.js';
import {
  nflWeeks, nflGames, users, leagueMembers, leagues, userPicks,
  emailNotifications, EMAIL_KIND_PICKS_UNLOCKED, EMAIL_KIND_PICKS_LOCK_WARNING,
  EMAIL_SENT, EMAIL_FAILED,
} from '../shared/schema.js';
import {
  sendWeeklyPickReminderEmail, sendPicksUnlockedEmail,
  buildWeeklyPickReminderEmail, buildPicksUnlockedEmail, pickPageUrl, isDryRun,
} from './email.js';
import { formatPicksLockAt, formatPicksLockTimeOnly, easternDateString, formatDateInEasternTime } from './timezoneUtils.js';
import { pullNFLGamesFromOddsAPI } from './nflDataPuller.js';
import {
  decideSpreadPull, announcementDue, announcedOutOfBand, hasSpread, MAX_SPREAD_PULL_ATTEMPTS,
} from './spreadPullPolicy.js';
import { pullNFLResultsFromESPN, pullResultsForActiveWeeks } from './espnResultsPuller.js';
import type { IStorage } from './storage.js';
import { storage } from './storage.js';
import { eq, and, gte, lte, lt, asc, desc } from 'drizzle-orm';

/** One member a send run touched — the manifest a dry run reports back. */
export interface EmailRecipient {
  username: string;
  email: string;
  subject: string;
  leagues: string[];
  link: string;
}

class GameScheduler {
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private isRunning = false;
  /** Per-week Odds API attempt budget, so a broken week cannot drain the quota. */
  private spreadPullAttempts: Map<number, { count: number; lastAttemptAt: number; exhaustedLogged: boolean }> = new Map();
  /** Weeks this process has finished announcing, so the sweep stops re-checking. */
  private announcedWeeks = new Set<number>();
  /** Weeks already warned about an unreadable send log, to keep it out of every tick. */
  private unloggableWeeks = new Set<number>();
  /** Last computed state per week, surfaced by getStatus() for the admin page. */
  private spreadPullState: Map<number, {
    weekNumber: number; pullAt: string; status: string; gamesWithSpreads: number; gamesTotal: number;
  }> = new Map();
  private storage: IStorage;

  /** False once a notifications-table read has failed; surfaced by the admin endpoints. */
  private notificationLogAvailable = true;
  /** `kind:weekId:userId` of sends made while the table was unreachable. */
  private memoryNotified = new Set<string>();

  /** Whether the durable send log is usable, for the admin status endpoints. */
  isNotificationLogAvailable() {
    return this.notificationLogAvailable;
  }

  constructor(storage: IStorage) {
    this.storage = storage;
    console.log('[Scheduler] Initializing NFL Game Data Scheduler');
  }

  /**
   * Start the scheduler - checks every hour for upcoming games that need data pulls
   */
  start() {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[Scheduler] Starting NFL game data scheduler');
    if (isDryRun()) {
      console.warn('[Scheduler] ⚠️  EMAIL_DRY_RUN is set — scheduled emails will be logged, NOT delivered.');
    }

    // Spreads: sweep every ten minutes rather than arming one job at the
    // trigger time. A one-shot in-process cron only fires if this exact
    // container is still alive at that minute, which on an autoscale
    // deployment it usually is not — the pull would simply never happen. A
    // sweep re-derives what is due from the database on every tick, so any
    // instance that is up (including one that cold-starts an hour late)
    // catches it, and the pull lands within ten minutes of its trigger.
    cron.schedule('*/10 * * * *', async () => {
      await this.sweepSpreadPulls();
    });

    // Results are still scheduled hourly off each week's last kickoff.
    cron.schedule('0 * * * *', async () => {
      await this.checkAndScheduleResultsPulls();
    });

    // Picks-lock warnings are driven off each week's own picksLockAt rather
    // than a hardcoded Sunday noon, so a week that locks at a non-standard
    // time still gets its reminder exactly one hour out. Checking every five
    // minutes (instead of firing one job at T-60) means a restart or a brief
    // outage inside the window still delivers — the send log keeps it to one
    // email per member per week.
    cron.schedule('*/5 * * * *', async () => {
      await this.checkPickLockWarnings();
    });

    // Schedule hourly results pulls during game windows:
    // Sunday 1pm-midnight ET (right after picks lock at 1pm)
    cron.schedule('0 13-23 * * 0', async () => {
      const hour = new Date().toLocaleString('en-US', { hour: 'numeric', hour12: true, timeZone: 'America/New_York' });
      console.log(`[Scheduler] Executing Sunday results pull at ${hour} ET...`);
      await this.executeDailyResultsPull();
    }, {
      timezone: 'America/New_York'
    });

    // Monday 8pm-11pm ET (Monday Night Football window)
    cron.schedule('0 20-23 * * 1', async () => {
      const hour = new Date().toLocaleString('en-US', { hour: 'numeric', hour12: true, timeZone: 'America/New_York' });
      console.log(`[Scheduler] Executing Monday results pull at ${hour} ET...`);
      await this.executeDailyResultsPull();
    }, {
      timezone: 'America/New_York'
    });

    // Tuesday 12am-1am ET (final Monday Night Football results)
    cron.schedule('0 0-1 * * 2', async () => {
      const hour = new Date().toLocaleString('en-US', { hour: 'numeric', hour12: true, timeZone: 'America/New_York' });
      console.log(`[Scheduler] Executing Tuesday results pull at ${hour} ET...`);
      await this.executeDailyResultsPull();
    }, {
      timezone: 'America/New_York'
    });

    // Also run immediately on startup, so a deploy or a cold start picks up
    // anything that came due while nothing was running.
    this.sweepSpreadPulls();
    this.checkAndScheduleResultsPulls();
  }

  /**
   * Stop the scheduler and cancel all scheduled jobs
   */
  stop() {
    console.log('[Scheduler] Stopping scheduler and canceling all jobs');
    this.scheduledJobs.forEach((job, weekId) => {
      job.destroy();
      console.log(`[Scheduler] Canceled job for week ${weekId}`);
    });
    this.scheduledJobs.clear();
    this.isRunning = false;
  }

  /** Every NFL week that has not finished yet, earliest first. */
  private async upcomingWeeks() {
    return await db
      .select()
      .from(nflWeeks)
      .where(gte(nflWeeks.endDate, easternDateString(new Date())))
      .orderBy(asc(nflWeeks.weekNumber));
  }

  /**
   * Check every upcoming week and pull spreads for any that are due.
   */
  private async sweepSpreadPulls() {
    let weeks: Awaited<ReturnType<GameScheduler['upcomingWeeks']>>;
    try {
      weeks = await this.upcomingWeeks();
    } catch (error) {
      console.error('[Scheduler] Error sweeping for spread pulls:', error);
      return;
    }

    for (const week of weeks) {
      // Per week, so one bad week does not cost every later week its pull.
      try {
        const { pulledFromEmpty, boardIsUp } = await this.pullSpreadsIfDue(week);

        // Announcing is a separate question from pulling, and asked on every
        // tick a board exists: a week whose lines were already in the
        // database — an early pull, a manual one — needs no API call but
        // still has to be announced when its trigger comes round.
        if (boardIsUp) {
          await this.announcePicksUnlockedIfDue(week, { pulledFromEmpty });
        }
      } catch (error) {
        console.error(`[Scheduler] Error servicing spreads for week ${week.weekNumber}:`, error);
      }
    }
  }

  /**
   * Check every upcoming week and schedule its results pull.
   */
  private async checkAndScheduleResultsPulls() {
    try {
      console.log('[Scheduler] Checking for weeks that need results pulls...');
      for (const week of await this.upcomingWeeks()) {
        await this.scheduleWeekResultsPull(week);
      }
    } catch (error) {
      console.error('[Scheduler] Error checking for games:', error);
    }
  }

  /**
   * Pull one week's spreads if its trigger time has passed and the board is
   * still incomplete.
   *
   * Scoped to this week: `pullNFLGamesFromOddsAPI` is given the week id, so
   * games the Odds API returns for any other week are read and skipped, never
   * written. The rule itself lives in spreadPullPolicy.ts.
   */
  private async pullSpreadsIfDue(week: any) {
    const now = Date.now();

    const games = await db
      .select()
      .from(nflGames)
      .where(eq(nflGames.weekId, week.id))
      .orderBy(asc(nflGames.gameTime));

    const attempts = this.spreadPullAttempts.get(week.id)
      ?? { count: 0, lastAttemptAt: 0, exhaustedLogged: false };
    const decision = decideSpreadPull(week, games, now, attempts);

    this.spreadPullState.set(week.id, {
      weekNumber: week.weekNumber,
      pullAt: formatDateInEasternTime(decision.pullAt),
      status: decision.status,
      gamesWithSpreads: decision.total - decision.missing,
      gamesTotal: decision.total,
    });

    if (decision.status === 'exhausted' && !attempts.exhaustedLogged) {
      this.spreadPullAttempts.set(week.id, { ...attempts, exhaustedLogged: true });
      console.error(
        `[Scheduler] ❌ Gave up pulling spreads for week ${week.weekNumber} after ` +
        `${attempts.count} attempts — ${decision.missing}/${decision.total} games still have no spread. ` +
        `Check GET /api/admin/system/preflight/spreads, then pull by hand with ` +
        `POST /api/admin/scheduler/manual-pull.`
      );
    }

    if (!decision.pull) {
      return { pulledFromEmpty: false, boardIsUp: decision.total > decision.missing };
    }

    this.spreadPullAttempts.set(week.id, {
      count: attempts.count + 1,
      lastAttemptAt: now,
      exhaustedLogged: false,
    });

    console.log(
      `[Scheduler] ⏰ Week ${week.weekNumber} spreads are due ` +
      `(trigger ${formatDateInEasternTime(decision.pullAt)} ET, ` +
      `${decision.total === 0
        ? 'no games on the board yet'
        : `${decision.missing}/${decision.total} games without a spread`}, ` +
      `attempt ${attempts.count + 1}/${MAX_SPREAD_PULL_ATTEMPTS})`
    );
    const pull = await this.executeDataPull(week);
    return {
      pulledFromEmpty: Boolean(pull && pull.before === 0 && pull.after > 0),
      boardIsUp: Boolean(pull && pull.after > 0),
    };
  }

  /**
   * Schedule results pull for a specific NFL week (5 hours after last game)
   */
  private async scheduleWeekResultsPull(week: any) {
    const weekKey = `results-week-${week.id}`;

    // Skip if already scheduled
    if (this.scheduledJobs.has(weekKey)) {
      return;
    }

    try {
      // Get all games for this week to find the latest game
      const games = await db
        .select()
        .from(nflGames)
        .where(eq(nflGames.weekId, week.id))
        .orderBy(asc(nflGames.gameTime));

      if (games.length === 0) {
        console.log(`[Scheduler] No games found for results pull in week ${week.weekNumber}`);
        return;
      }

      const lastGame = games[games.length - 1];
      const lastGameTime = new Date(lastGame.gameTime);
      const resultsPullTime = new Date(lastGameTime.getTime() + (5 * 60 * 60 * 1000)); // 5 hours after
      const currentTime = new Date();

      console.log(`[Scheduler] Week ${week.weekNumber}: Last game at ${lastGameTime.toISOString()}, results pull scheduled for ${resultsPullTime.toISOString()}`);

      // If the pull time has already passed, pull immediately
      if (resultsPullTime <= currentTime) {
        console.log(`[Scheduler] Results pull time for week ${week.weekNumber} has passed, executing immediately`);
        await this.executeResultsPull(week);
        return;
      }

      // Schedule the results pull
      const cronExpression = this.getCronExpression(resultsPullTime);
      console.log(`[Scheduler] Scheduling results pull for week ${week.weekNumber} with cron: ${cronExpression}`);

      const job = cron.schedule(cronExpression, async () => {
        console.log(`[Scheduler] ⏰ EXECUTING scheduled results pull for week ${week.weekNumber} at ${new Date().toISOString()}`);
        await this.executeResultsPull(week);
        
        // Remove the job after execution
        this.scheduledJobs.delete(weekKey);
        job.destroy();
        console.log(`[Scheduler] ✅ Completed and removed results job for week ${week.weekNumber}`);
      }, {
        timezone: 'America/New_York',
      });

      // Explicitly start the job
      job.start();
      
      this.scheduledJobs.set(weekKey, job);
      console.log(`[Scheduler] Scheduled results pull for week ${week.weekNumber} at ${resultsPullTime.toISOString()}`);
      console.log(`[Scheduler] Job status - Results week ${week.weekNumber}: scheduled=${cronExpression}, timezone=America/New_York`);

    } catch (error) {
      console.error(`[Scheduler] Error scheduling results pull for week ${week.weekNumber}:`, error);
    }
  }

  /**
   * Execute the actual results pull for a week
   */
  private async executeResultsPull(week: any) {
    try {
      console.log(`[Scheduler] ⏰ Pulling game results for NFL week ${week.weekNumber}...`);
      
      // Call the shared ESPN results puller function
      const result = await pullNFLResultsFromESPN(this.storage, week.id);
      
      console.log(`[Scheduler] ✅ Successfully completed results pull for week ${week.weekNumber}:`, result.results);
      
    } catch (error) {
      console.error(`[Scheduler] ❌ Error executing results pull for week ${week.weekNumber}:`, error);
    }
  }

  /**
   * Execute the actual data pull for a week
   */
  private async executeDataPull(week: any) {
    try {
      console.log(`[Scheduler] ⏰ Pulling game data for NFL week ${week.weekNumber}...`);

      // "Picks are open" is an event, and the event is the board going from
      // empty to posted. Counting either side of the pull is what makes that
      // knowable to the caller: a pull that tops up one straggler on a board
      // the league was already told about is not a second unlock.
      const before = await this.countSpreads(week.id);

      // Scoped to this week — the Odds API answers with every upcoming game,
      // and the puller writes only the ones that bucket into `week.id`.
      const result = await pullNFLGamesFromOddsAPI(this.storage, week.id);

      console.log(`[Scheduler] ✅ Successfully completed scheduled data pull for week ${week.weekNumber}:`, result.results);

      const after = await this.countSpreads(week.id);

      // A run can update kickoff times and still post no spread — a 401 from
      // the book, a week the API has not opened yet.
      if (after === 0) {
        console.warn(
          `[Scheduler] ⚠️  Week ${week.weekNumber}: pull completed but no spreads are posted ` +
          `(${result.results.gamesFound} games returned by the API, ${result.results.errors} could not be processed). ` +
          `The next sweep will retry.`
        );
      }

      return { ...result, before, after };
    } catch (error) {
      console.error(`[Scheduler] ❌ Error executing data pull for week ${week.weekNumber}:`, error);
    }
  }

  /** How many of a week's games have a spread posted. */
  private async countSpreads(weekId: number): Promise<number> {
    const games = await db.select().from(nflGames).where(eq(nflGames.weekId, weekId));
    return games.filter(hasSpread).length;
  }

  /**
   * Tell the league its board is up — once per week.
   *
   * Driven by the state of the week rather than by whether this tick pulled.
   * The old code only ever mailed as a side effect of the pull it had just
   * run, so a week whose lines were already in the database got no email at
   * all, and every re-pull was another chance to mail the league twice.
   *
   * Three things have to hold: the board is actually up, picks are still
   * open, and it is time — either the week's own trigger has passed, or this
   * caller's pull is what just put the board up, which is an admin saying so
   * explicitly.
   */
  async announcePicksUnlockedIfDue(week: any, opts: { pulledFromEmpty: boolean }) {
    if (this.announcedWeeks.has(week.id)) return null;

    // A week already announced by hand has no send-log rows to dedupe
    // against, so nothing else here would stop a second email.
    if (announcedOutOfBand(week)) {
      this.announcedWeeks.add(week.id);
      console.log(
        `[Scheduler] Week ${week.weekNumber} (${week.season}) was announced out of band — ` +
        `holding "picks are open". Remove it from ANNOUNCED_OUT_OF_BAND in spreadPullPolicy.ts ` +
        `to let the automation mail this week.`
      );
      return null;
    }

    const now = Date.now();
    const games = await db
      .select()
      .from(nflGames)
      .where(eq(nflGames.weekId, week.id))
      .orderBy(asc(nflGames.gameTime));

    if (!announcementDue(week, games, now, opts)) return null;

    // Read the send log first, which is also what tells us whether it can be
    // read at all. Without it there is no way to know the league has not
    // already been told, and mailing them a second time is worse than not
    // mailing them again — so in that state only the pull that just put the
    // board up is allowed to announce.
    await this.alreadyNotified(EMAIL_KIND_PICKS_UNLOCKED, week.id);
    if (!this.notificationLogAvailable && !opts.pulledFromEmpty) {
      // Once per week per process — the sweep asks again every ten minutes.
      if (!this.unloggableWeeks.has(week.id)) {
        this.unloggableWeeks.add(week.id);
        console.warn(
          `[Scheduler] ⚠️  Week ${week.weekNumber}: board is up but the send log is unreadable, ` +
          `so "picks are open" cannot be sent without risking a duplicate. Run "npm run db:push", ` +
          `or send it by hand with POST /api/admin/scheduler/test-picks-unlocked.`
        );
      }
      return null;
    }

    const outcome = await this.sendPicksUnlockedNotifications(week.weekNumber, { season: week.season });

    // Nothing failed means there is nothing left to do for this week: members
    // already mailed were skipped, and any new member is picked up by the
    // weekly reminder. A failure stays unmarked so the next sweep retries it.
    if (outcome.emailsFailed === 0) this.announcedWeeks.add(week.id);
    return outcome;
  }

  /**
   * Execute hourly results pull for all active weeks
   * This runs hourly during game windows: Sun 1pm-11pm, Mon all day, Tue 12am-1am ET
   */
  private async executeDailyResultsPull() {
    try {
      console.log(`[Scheduler] ⏰ Starting hourly results pull at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
      
      // Call the shared ESPN results puller for all active weeks
      const result = await pullResultsForActiveWeeks(this.storage);
      
      console.log(`[Scheduler] ✅ Hourly results pull completed: ${result.weeksProcessed} weeks processed`);
      
    } catch (error) {
      console.error(`[Scheduler] ❌ Error executing hourly results pull:`, error);
    }
  }

  /**
   * Convert a Date to cron expression
   * Since cron is scheduled with timezone 'America/New_York', we need to extract
   * the time components in Eastern Time, not UTC
   */
  private getCronExpression(date: Date): string {
    // Convert to Eastern Time to get the correct hours/minutes/day/month
    const etString = date.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      hour12: false
    });
    
    // Parse the ET string to extract components
    // Format will be like: "10/09/2025, 12:15"
    const [datePart, timePart] = etString.split(', ');
    const [month, dayOfMonth, year] = datePart.split('/').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    
    // Create a one-time cron job for this specific date/time in ET
    return `${minutes} ${hours} ${dayOfMonth} ${month} *`;
  }

  /**
   * Get status of all scheduled jobs
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      scheduledJobs: Array.from(this.scheduledJobs.keys()),
      jobCount: this.scheduledJobs.size,
      // Spreads are swept, not pre-scheduled, so jobCount says nothing about
      // them. This is the line an admin actually needs: when each upcoming
      // week's spreads are due and where that week currently stands.
      spreadPulls: Array.from(this.spreadPullState.values()),
    };
  }

  /**
   * The week an admin means when they press a button without naming one.
   * Never a hardcoded week 1: with several seasons in the table that row is
   * whichever the database hands back first, which in September 2026 can
   * still be September 2025.
   */
  private async currentWeekOrThrow() {
    const week = await this.storage.getCurrentNFLWeek();
    if (!week) {
      throw new Error('No current or upcoming NFL week found — seed the schedule first');
    }
    return week;
  }

  /**
   * Run the data pull for the current week exactly as the trigger would,
   * ignoring the trigger time. Writes spreads and sends the picks-unlocked
   * email, so it doubles as the "the automation did not fire" recovery.
   */
  async testScheduledJob() {
    try {
      const week = await this.currentWeekOrThrow();
      console.log(`[Scheduler] Simulating data pull for week ${week.weekNumber} as if 8 hours before first game...`);
      const result = await this.executeDataPull(week);
      const notifications = await this.announcePicksUnlockedIfDue(week, {
        pulledFromEmpty: Boolean(result && result.before === 0 && result.after > 0),
      });

      return {
        success: true,
        message: `Test completed for week ${week.weekNumber}`,
        weekNumber: week.weekNumber,
        results: result?.results ?? null,
        notifications,
      };
    } catch (error) {
      console.error('[Scheduler] Test failed:', error);
      throw error;
    }
  }

  /**
   * Test the scheduled results job by running it as if it were 5 hours after last game
   */
  async testResultsJob() {
    try {
      console.log('[Scheduler] Testing scheduled results job execution...');

      const week = await this.currentWeekOrThrow();
      console.log(`[Scheduler] Simulating results pull for week ${week.weekNumber} as if 5 hours after last game...`);
      await this.executeResultsPull(week);

      return {
        success: true,
        message: `Results test completed for week ${week.weekNumber}`,
        weekNumber: week.weekNumber
      };
    } catch (error) {
      console.error('[Scheduler] Results test failed:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Scheduled member email
  // -------------------------------------------------------------------------

  /**
   * Members already mailed this kind of notice for this week.
   *
   * The lock-warning check runs every five minutes and the app restarts often,
   * so this has to be read from the database — an in-memory guard would mail
   * the whole league again after any restart inside the send window.
   */
  private async alreadyNotified(kind: string, weekId: number): Promise<Set<string>> {
    try {
      const rows = await db
        .select({ userId: emailNotifications.userId })
        .from(emailNotifications)
        .where(and(
          eq(emailNotifications.kind, kind),
          eq(emailNotifications.weekId, weekId),
          // Deliberately 'sent' only: a member whose send failed is still owed an
          // email, so the next tick retries them rather than writing them off.
          eq(emailNotifications.status, EMAIL_SENT)
        ));
      this.notificationLogAvailable = true;
      return new Set(rows.map(r => r.userId));
    } catch (error) {
      // Almost always "relation email_notifications does not exist" — the
      // migration has not been run on this database yet.
      //
      // Letting this propagate would be the worst outcome available: the outer
      // catch in both send paths would swallow it and the week would go out
      // with no email at all and no obvious reason. So degrade instead of
      // failing. In-memory dedupe still stops the five-minute lock check from
      // mailing the same member twelve times in the hour; the cost is that a
      // restart mid-window could repeat one email, which is far better than
      // sending none.
      this.notificationLogAvailable = false;
      console.error(
        `[Scheduler] ⚠️  Cannot read email_notifications (run "npm run db:push"). ` +
        `Falling back to in-memory dedupe for this process — emails WILL still send, ` +
        `but a restart could repeat one. Error:`, error
      );
      const prefix = `${kind}:${weekId}:`;
      return new Set(
        Array.from(this.memoryNotified)
          .filter(key => key.startsWith(prefix))
          .map(key => key.slice(prefix.length))
      );
    }
  }

  /**
   * Record the outcome of a send — success or failure, with Brevo's reason.
   * Upserts so a later retry can flip a 'failed' row to 'sent' rather than
   * colliding with the (kind, week, user) uniqueness constraint.
   */
  private async recordNotification(
    kind: string,
    weekId: number,
    userId: string,
    outcome: { ok: boolean; reason?: string; code?: string },
  ) {
    const status = outcome.ok ? EMAIL_SENT : EMAIL_FAILED;
    // Mirror successes in memory so dedupe still holds if the table is missing.
    if (outcome.ok) this.memoryNotified.add(`${kind}:${weekId}:${userId}`);
    const error = outcome.ok
      ? null
      : [outcome.reason, outcome.code ? `[${outcome.code}]` : null].filter(Boolean).join(' ') || 'unknown error';
    try {
      await db
        .insert(emailNotifications)
        .values({ kind, weekId, userId, status, error })
        .onConflictDoUpdate({
          target: [emailNotifications.kind, emailNotifications.weekId, emailNotifications.userId],
          set: { status, error, sentAt: new Date() },
        });
    } catch (dbError) {
      // A missing log row only risks a duplicate email later; never let it
      // abort a send run that is otherwise working.
      this.notificationLogAvailable = false;
      console.error(`[Scheduler] Failed to record ${kind} notification for user ${userId}:`, dbError);
    }
  }

  /**
   * Active, notification-enabled members of live NFL leagues, one entry per
   * person with every league they belong to. A member of several leagues gets
   * one email listing all of them rather than one email per league.
   */
  private async getNotifiableMembers() {
    const memberRows = await db
      .select({
        userId: users.id,
        username: users.username,
        email: users.email,
        leagueId: leagues.id,
        leagueName: leagues.name,
      })
      .from(users)
      .innerJoin(leagueMembers, eq(users.id, leagueMembers.userId))
      .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
      .where(and(
        eq(leagueMembers.isActive, true),
        eq(users.receiveNotifications, true),
        eq(leagues.isArchived, false),
        eq(leagues.sportType, 'nfl')
      ));

    const byUser = new Map<string, {
      userId: string;
      username: string;
      email: string;
      leagues: Array<{ id: number; name: string }>;
    }>();
    for (const m of memberRows) {
      if (!m.email) continue;
      if (!byUser.has(m.userId)) {
        // username is nullable (OAuth signups land here before setup), and
        // "Hi null," is worse than the local part of their address.
        const displayName = m.username || m.email.split('@')[0];
        byUser.set(m.userId, { userId: m.userId, username: displayName, email: m.email, leagues: [] });
      }
      byUser.get(m.userId)!.leagues.push({ id: m.leagueId, name: m.leagueName });
    }
    return Array.from(byUser.values());
  }

  /** Resolve a week number to its row, preferring the most recent season. */
  private async findWeek(weekNumber: number, season?: number) {
    const rows = await db
      .select()
      .from(nflWeeks)
      .where(season !== undefined
        ? and(eq(nflWeeks.weekNumber, weekNumber), eq(nflWeeks.season, season))
        : eq(nflWeeks.weekNumber, weekNumber))
      .orderBy(desc(nflWeeks.season))
      .limit(1);
    return rows[0];
  }

  /**
   * Tell every active member the week's spreads are posted and picks are open.
   * Called right after a successful odds pull; safe to call again, since
   * members already mailed for this week are skipped unless `force` is set.
   */
  async sendPicksUnlockedNotifications(
    weekNumber: number,
    options: { force?: boolean; season?: number; dryRun?: boolean } = {}
  ) {
    try {
      console.log(`[Scheduler] Sending picks unlocked notifications for Week ${weekNumber}...`);

      // Only send for regular season weeks (1-18)
      const empty = { weekNumber, emailsSent: 0, emailsFailed: 0, skipped: 0, dryRun: Boolean(options.dryRun), recipients: [] as EmailRecipient[] };
      if (weekNumber < 1 || weekNumber > 18) {
        console.log(`[Scheduler] Week ${weekNumber} is not a regular season week (1-18), skipping picks unlocked notifications`);
        return empty;
      }

      const week = await this.findWeek(weekNumber, options.season);
      if (!week) {
        console.log(`[Scheduler] No NFL week ${weekNumber} found, skipping picks unlocked notifications`);
        return empty;
      }

      // Spreads posted but the week already locked — a "go pick" email would
      // send members to a board they can no longer use.
      if (new Date(week.picksLockAt).getTime() <= Date.now()) {
        console.log(`[Scheduler] Week ${weekNumber} picks already locked, skipping picks unlocked notifications`);
        return empty;
      }

      const lockDeadline = formatPicksLockAt(new Date(week.picksLockAt));
      const activeMembers = await this.getNotifiableMembers();
      const alreadySent = options.force
        ? new Set<string>()
        : await this.alreadyNotified(EMAIL_KIND_PICKS_UNLOCKED, week.id);

      console.log(`[Scheduler] Found ${activeMembers.length} active members to notify about picks being live (${alreadySent.size} already notified)`);

      let emailsSent = 0;
      let emailsFailed = 0;
      let skipped = 0;
      const recipients: EmailRecipient[] = [];

      for (const member of activeMembers) {
        if (alreadySent.has(member.userId)) {
          skipped++;
          continue;
        }

        const memberLeagues = member.leagues.map(l => ({ id: l.id, name: l.name }));

        // A dry run does everything except hand the message to Brevo, and
        // records nothing — so it can't suppress the real send later.
        if (options.dryRun) {
          const preview = buildPicksUnlockedEmail(member.username, weekNumber, memberLeagues, lockDeadline);
          recipients.push({
            username: member.username,
            email: member.email,
            subject: preview.subject,
            leagues: memberLeagues.map(l => l.name),
            link: pickPageUrl(memberLeagues.length === 1 ? memberLeagues[0].id : undefined),
          });
          emailsSent++;
          continue;
        }

        try {
          const result = await sendPicksUnlockedEmail(
            member.email,
            member.username,
            weekNumber,
            memberLeagues,
            lockDeadline
          );

          // Logged either way: a failure row is what lets an admin tell a job
          // that never ran from one Brevo rejected, and it is retried next tick.
          await this.recordNotification(EMAIL_KIND_PICKS_UNLOCKED, week.id, member.userId, result);
          if (result.ok) {
            emailsSent++;
          } else {
            console.error(`[Scheduler] Picks unlocked email to ${member.email} failed: ${result.reason}`);
            emailsFailed++;
          }
        } catch (error) {
          console.error(`[Scheduler] Failed to send picks unlocked email to ${member.email}:`, error);
          emailsFailed++;
        }
      }

      const label = options.dryRun ? 'DRY RUN — would send' : 'sent';
      console.log(`[Scheduler] Picks unlocked notifications completed: ${emailsSent} ${label}, ${emailsFailed} failed, ${skipped} already notified`);
      return { weekNumber, emailsSent, emailsFailed, skipped, dryRun: Boolean(options.dryRun), recipients };
    } catch (error) {
      console.error('[Scheduler] Error sending picks unlocked notifications:', error);
      return { weekNumber, emailsSent: 0, emailsFailed: 0, skipped: 0, dryRun: Boolean(options.dryRun), recipients: [] as EmailRecipient[] };
    }
  }

  /**
   * Every five minutes: is any week inside the final hour before its picks
   * lock? If so, warn the members who still have no pick in.
   */
  async checkPickLockWarnings(options: { asOf?: Date; dryRun?: boolean } = {}) {
    const results: Array<Awaited<ReturnType<GameScheduler['sendPickLockWarnings']>>> = [];
    try {
      // `asOf` lets an admin ask "who would this mail if it were Sunday
      // 12:05?" without waiting for Sunday. Only ever passed by the dry-run
      // endpoint; the cron always uses the real clock.
      const now = options.asOf ?? new Date();
      const oneHourOut = new Date(now.getTime() + 60 * 60 * 1000);

      // Weeks locking within the next hour (and not yet locked).
      const weeks = await db
        .select()
        .from(nflWeeks)
        .where(and(
          gte(nflWeeks.picksLockAt, now),
          lt(nflWeeks.picksLockAt, oneHourOut)
        ))
        .orderBy(asc(nflWeeks.picksLockAt));

      for (const week of weeks) {
        results.push(await this.sendPickLockWarnings(week, { dryRun: options.dryRun }));
      }
    } catch (error) {
      console.error('[Scheduler] Error checking for picks-lock warnings:', error);
    }
    return results;
  }

  /**
   * Warn active members with no pick in for `week` that picks lock in an hour.
   * Idempotent: a member is mailed at most once per week unless `force` is set.
   */
  async sendPickLockWarnings(week: any, options: { force?: boolean; dryRun?: boolean } = {}) {
    const result = {
      weekNumber: week.weekNumber,
      picksLockAt: week.picksLockAt,
      emailsSent: 0,
      emailsFailed: 0,
      skipped: 0,
      dryRun: Boolean(options.dryRun),
      recipients: [] as EmailRecipient[],
    };
    try {
      // Only send emails for regular season weeks (1-18)
      if (week.weekNumber < 1 || week.weekNumber > 18) {
        console.log(`[Scheduler] Week ${week.weekNumber} is not a regular season week (1-18), skipping picks-lock warnings`);
        return result;
      }

      const lockTime = formatPicksLockTimeOnly(new Date(week.picksLockAt));
      const members = await this.getNotifiableMembers();
      const alreadySent = options.force
        ? new Set<string>()
        : await this.alreadyNotified(EMAIL_KIND_PICKS_LOCK_WARNING, week.id);

      console.log(`[Scheduler] Week ${week.weekNumber} locks at ${lockTime}; checking ${members.length} active members (${alreadySent.size} already warned)`);

      // Every pick already in for this week, in one query rather than one per member.
      const picksThisWeek = await db
        .select({ userId: userPicks.userId, leagueId: userPicks.leagueId })
        .from(userPicks)
        .where(eq(userPicks.weekId, week.id));
      const pickedByUser = new Map<string, Set<number>>();
      for (const pick of picksThisWeek) {
        if (!pickedByUser.has(pick.userId)) pickedByUser.set(pick.userId, new Set());
        pickedByUser.get(pick.userId)!.add(pick.leagueId);
      }

      for (const member of members) {
        try {
          if (alreadySent.has(member.userId)) {
            result.skipped++;
            continue;
          }

          const picked = pickedByUser.get(member.userId) ?? new Set<number>();
          const missingLeagues = member.leagues.filter(l => !picked.has(l.id));

          if (missingLeagues.length === 0) {
            // Picks are in — keep it light, no email
            continue;
          }

          const missing = missingLeagues.map(l => ({ leagueName: l.name, leagueId: l.id }));

          // A dry run does everything except hand the message to Brevo, and
          // records nothing — so it can't suppress the real send later.
          if (options.dryRun) {
            const preview = buildWeeklyPickReminderEmail(member.username, week.weekNumber, missing, lockTime);
            result.recipients.push({
              username: member.username,
              email: member.email,
              subject: preview.subject,
              leagues: missing.map(l => l.leagueName),
              link: pickPageUrl(missing.length === 1 ? missing[0].leagueId : undefined),
            });
            result.emailsSent++;
            continue;
          }

          const sent = await sendWeeklyPickReminderEmail(
            member.email,
            member.username,
            week.weekNumber,
            missing,
            lockTime
          );

          await this.recordNotification(EMAIL_KIND_PICKS_LOCK_WARNING, week.id, member.userId, sent);
          if (sent.ok) {
            console.log(`[Scheduler] Sent picks-lock warning to ${member.username} (${member.email}) - missing ${missingLeagues.length} picks`);
            result.emailsSent++;
          } else {
            console.error(`[Scheduler] Picks-lock warning to ${member.username} failed: ${sent.reason}`);
            result.emailsFailed++;
          }
        } catch (error) {
          console.error(`[Scheduler] Error processing picks-lock warning for user ${member.userId}:`, error);
          result.emailsFailed++;
        }
      }

      const label = options.dryRun ? 'DRY RUN — would send' : 'sent';
      console.log(`[Scheduler] Picks-lock warnings for Week ${week.weekNumber} completed: ${result.emailsSent} ${label}, ${result.emailsFailed} failed, ${result.skipped} already warned`);
      return result;
    } catch (error) {
      console.error('[Scheduler] Error sending picks-lock warnings:', error);
      return result;
    }
  }

  /**
   * Resolve the NFL week covering today's date.
   * Uses the date range rather than the `active` flag, which lags behind.
   */
  private async getWeekForToday() {
    const today = new Date().toISOString().split('T')[0];
    const rows = await db
      .select()
      .from(nflWeeks)
      .where(and(
        lte(nflWeeks.startDate, today),
        gte(nflWeeks.endDate, today)
      ))
      .limit(1);
    return rows[0];
  }

  /**
   * Admin "send the picks-lock warnings now" path for the current week.
   * Defaults to re-sending (force) because an admin pressing the button has
   * asked for delivery, not for the scheduler's once-per-week guard.
   */
  async sendWeeklyEmailReminders(options: { force?: boolean; dryRun?: boolean } = {}) {
    const empty = {
      weekNumber: null as number | null,
      picksLockAt: null as Date | null,
      emailsSent: 0,
      emailsFailed: 0,
      skipped: 0,
      dryRun: Boolean(options.dryRun),
      recipients: [] as EmailRecipient[],
    };
    try {
      console.log('[Scheduler] Starting weekly email reminder process...');

      const week = await this.getWeekForToday();
      if (!week) {
        console.log('[Scheduler] No NFL week found for current date, skipping email reminders');
        return empty;
      }

      console.log(`[Scheduler] Sending reminders for Week ${week.weekNumber}`);
      return await this.sendPickLockWarnings(week, {
        force: options.force ?? true,
        dryRun: options.dryRun,
      });
    } catch (error) {
      console.error('[Scheduler] Error in weekly email reminder process:', error);
      return empty;
    }
  }

  /**
   * Manually trigger the current week's data pull.
   *
   * This used to log and return `{ success: true, gamesUpdated: 0 }` without
   * calling anything — so the admin button reported a green result while the
   * board stayed empty, which is worse than having no button. It now runs the
   * real pull, the same one the sweep runs, and reports what changed.
   */
  async triggerManualPull() {
    try {
      console.log('[Scheduler] Manual data pull triggered');

      const week = await this.currentWeekOrThrow();
      const result = await this.executeDataPull(week);

      // Attempts are per week, and a human asking again is a reason to keep
      // trying — otherwise a week that burned its budget stays stuck.
      this.spreadPullAttempts.delete(week.id);

      const notifications = await this.announcePicksUnlockedIfDue(week, {
        pulledFromEmpty: Boolean(result && result.before === 0 && result.after > 0),
      });

      const games = await db.select().from(nflGames).where(eq(nflGames.weekId, week.id));
      const withSpreads = games.filter(hasSpread).length;

      return {
        success: true,
        weekNumber: week.weekNumber,
        season: week.season,
        gamesCreated: result?.results.gamesCreated ?? 0,
        gamesUpdated: result?.results.gamesUpdated ?? 0,
        spreadsSet: result?.results.spreadsSet ?? 0,
        gamesWithSpreads: withSpreads,
        gamesTotal: games.length,
        notifications,
        message: `Week ${week.weekNumber}: ${withSpreads}/${games.length} games have spreads`,
      };
    } catch (error) {
      console.error('[Scheduler] Manual pull failed:', error);
      throw error;
    }
  }

}

// Create singleton instance
export const gameScheduler = new GameScheduler(storage);

// Auto-start the scheduler in production
if (process.env.NODE_ENV === 'production') {
  gameScheduler.start();
}