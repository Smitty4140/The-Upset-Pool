import * as cron from 'node-cron';
import { db } from './db.js';
import {
  nflWeeks, nflGames, users, leagueMembers, leagues, userPicks,
  emailNotifications, EMAIL_KIND_PICKS_UNLOCKED, EMAIL_KIND_PICKS_LOCK_WARNING,
} from '../shared/schema.js';
import {
  sendWeeklyPickReminderEmail, sendPicksUnlockedEmail,
  buildWeeklyPickReminderEmail, buildPicksUnlockedEmail, pickPageUrl, isDryRun,
} from './email.js';
import { formatPicksLockAt, formatPicksLockTimeOnly } from './timezoneUtils.js';
import { pullNFLGamesFromOddsAPI } from './nflDataPuller.js';
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
  private storage: IStorage;

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

    // Run every hour to check for upcoming games
    cron.schedule('0 * * * *', async () => {
      await this.checkAndScheduleDataPulls();
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

    // Also run immediately on startup
    this.checkAndScheduleDataPulls();
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

  /**
   * Check all NFL weeks and schedule data pulls 8 hours before first game
   */
  private async checkAndScheduleDataPulls() {
    try {
      console.log('[Scheduler] Checking for games that need data pulls...');

      // Get all NFL weeks from current date forward
      const currentDate = new Date().toISOString();
      const weeks = await db
        .select()
        .from(nflWeeks)
        .where(gte(nflWeeks.endDate, currentDate))
        .orderBy(asc(nflWeeks.weekNumber));

      for (const week of weeks) {
        await this.scheduleWeekDataPull(week);
        await this.scheduleWeekResultsPull(week);
      }

    } catch (error) {
      console.error('[Scheduler] Error checking for games:', error);
    }
  }

  /**
   * Schedule data pull for a specific NFL week
   */
  private async scheduleWeekDataPull(week: any) {
    const weekKey = `week-${week.id}`;

    // Skip if already scheduled
    if (this.scheduledJobs.has(weekKey)) {
      return;
    }

    try {
      // Get all games for this week to find the earliest game
      const games = await db
        .select()
        .from(nflGames)
        .where(eq(nflGames.weekId, week.id))
        .orderBy(asc(nflGames.gameTime));

      if (games.length === 0) {
        console.log(`[Scheduler] No games found for week ${week.weekNumber}`);
        return;
      }

      const firstGame = games[0];
      const firstGameTime = new Date(firstGame.gameTime);
      const pullTime = new Date(firstGameTime.getTime() - (8 * 60 * 60 * 1000)); // 8 hours before
      const currentTime = new Date();

      console.log(`[Scheduler] Week ${week.weekNumber}: First game at ${firstGameTime.toISOString()}, spreads available in 8 hours (data pull) scheduled for ${pullTime.toISOString()}`);

      // If the pull time has already passed, check if we need to pull
      if (pullTime <= currentTime) {
        // Check if spreads have already been pulled for this week
        // A week is considered "pulled" if at least one game has a non-zero spread
        const gamesWithSpreads = games.filter(g => {
          const spread = parseFloat(String(g.spread)) || 0;
          return spread !== 0;
        });
        
        if (gamesWithSpreads.length > 0) {
          console.log(`[Scheduler] Week ${week.weekNumber}: Spreads already pulled (${gamesWithSpreads.length}/${games.length} games have spreads), skipping API call`);
          return;
        }
        
        console.log(`[Scheduler] Pull time for week ${week.weekNumber} has passed and no spreads set, executing data pull`);
        await this.executeDataPull(week);
        return;
      }

      // Schedule the data pull
      const cronExpression = this.getCronExpression(pullTime);
      console.log(`[Scheduler] Scheduling data pull for week ${week.weekNumber} with cron: ${cronExpression}`);

      const job = cron.schedule(cronExpression, async () => {
        console.log(`[Scheduler] ⏰ EXECUTING scheduled data pull for week ${week.weekNumber} at ${new Date().toISOString()}`);
        await this.executeDataPull(week);
        
        // Remove the job after execution
        this.scheduledJobs.delete(weekKey);
        job.destroy();
        console.log(`[Scheduler] ✅ Completed and removed job for week ${week.weekNumber}`);
      }, {
        timezone: 'America/New_York',
        scheduled: true
      });

      // Explicitly start the job
      job.start();
      
      this.scheduledJobs.set(weekKey, job);
      console.log(`[Scheduler] Scheduled data pull for week ${week.weekNumber} at ${pullTime.toISOString()}`);
      console.log(`[Scheduler] Job status - Week ${week.weekNumber}: scheduled=${cronExpression}, timezone=America/New_York`);

    } catch (error) {
      console.error(`[Scheduler] Error scheduling week ${week.weekNumber}:`, error);
    }
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
        scheduled: true
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
      
      // Call the shared pullNFLGamesFromOddsAPI function
      const result = await pullNFLGamesFromOddsAPI(this.storage, week.id);
      
      console.log(`[Scheduler] ✅ Successfully completed scheduled data pull for week ${week.weekNumber}:`, result.results);
      
      // Tell the league picks are open (active, notification-enabled members)
      await this.sendPicksUnlockedNotifications(week.weekNumber, { season: week.season });
      
    } catch (error) {
      console.error(`[Scheduler] ❌ Error executing data pull for week ${week.weekNumber}:`, error);
    }
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
      jobCount: this.scheduledJobs.size
    };
  }

  /**
   * Test the scheduled job by running it as if it were 8 hours before first game
   */
  async testScheduledJob() {
    try {
      console.log('[Scheduler] Testing scheduled job execution...');
      
      // For testing, use Week 1 (since we're not in the actual NFL season date range)
      const testWeek = await db
        .select()
        .from(nflWeeks)
        .where(eq(nflWeeks.weekNumber, 1))
        .limit(1);

      if (testWeek.length === 0) {
        throw new Error('No NFL Week 1 found for testing');
      }

      console.log(`[Scheduler] Simulating data pull for week ${testWeek[0].weekNumber} as if 8 hours before first game...`);
      await this.executeDataPull(testWeek[0]);
      
      return {
        success: true,
        message: `Test completed for week ${testWeek[0].weekNumber}`,
        weekNumber: testWeek[0].weekNumber
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
      
      // For testing, use Week 1 (since we're not in the actual NFL season date range)
      const testWeek = await db
        .select()
        .from(nflWeeks)
        .where(eq(nflWeeks.weekNumber, 1))
        .limit(1);

      if (testWeek.length === 0) {
        throw new Error('No NFL Week 1 found for testing');
      }

      console.log(`[Scheduler] Simulating results pull for week ${testWeek[0].weekNumber} as if 5 hours after last game...`);
      await this.executeResultsPull(testWeek[0]);
      
      return {
        success: true,
        message: `Results test completed for week ${testWeek[0].weekNumber}`,
        weekNumber: testWeek[0].weekNumber
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
    const rows = await db
      .select({ userId: emailNotifications.userId })
      .from(emailNotifications)
      .where(and(
        eq(emailNotifications.kind, kind),
        eq(emailNotifications.weekId, weekId)
      ));
    return new Set(rows.map(r => r.userId));
  }

  /** Record a delivered email. Ignores conflicts so a concurrent worker can't double-insert. */
  private async recordNotification(kind: string, weekId: number, userId: string) {
    try {
      await db
        .insert(emailNotifications)
        .values({ kind, weekId, userId })
        .onConflictDoNothing();
    } catch (error) {
      // A missing log row only risks a duplicate email later; never let it
      // abort a send run that is otherwise working.
      console.error(`[Scheduler] Failed to record ${kind} notification for user ${userId}:`, error);
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
          const success = await sendPicksUnlockedEmail(
            member.email,
            member.username,
            weekNumber,
            memberLeagues,
            lockDeadline
          );

          if (success) {
            await this.recordNotification(EMAIL_KIND_PICKS_UNLOCKED, week.id, member.userId);
            emailsSent++;
          } else {
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

          const success = await sendWeeklyPickReminderEmail(
            member.email,
            member.username,
            week.weekNumber,
            missing,
            lockTime
          );

          if (success) {
            await this.recordNotification(EMAIL_KIND_PICKS_LOCK_WARNING, week.id, member.userId);
            console.log(`[Scheduler] Sent picks-lock warning to ${member.username} (${member.email}) - missing ${missingLeagues.length} picks`);
            result.emailsSent++;
          } else {
            console.error(`[Scheduler] Failed to send picks-lock warning to ${member.username}`);
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
   * Manually trigger a data pull for the current week (for testing)
   */
  async triggerManualPull() {
    try {
      console.log('[Scheduler] Manual data pull triggered');
      
      // For manual testing, use Week 1 (since we're not in the actual NFL season date range)
      const testWeek = await db
        .select()
        .from(nflWeeks)
        .where(eq(nflWeeks.weekNumber, 1))
        .limit(1);

      if (testWeek.length === 0) {
        throw new Error('No NFL Week 1 found for testing');
      }

      // For manual testing, just simulate the pull
      console.log(`[Scheduler] Manual pull completed for week ${testWeek[0].weekNumber}`);
      return {
        success: true,
        weekNumber: testWeek[0].weekNumber,
        gamesUpdated: 0,
        message: "Scheduler test completed successfully - would pull game data in production"
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