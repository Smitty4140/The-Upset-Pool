import * as cron from 'node-cron';
import { db } from './db.js';
import { nflWeeks, nflGames, users, leagueMembers, leagues, userPicks, nflTeams } from '../shared/schema.js';
import { sendWeeklyPickConfirmationEmail, sendWeeklyPickReminderEmail, sendPicksUnlockedEmail } from './email.js';
import { pullNFLGamesFromOddsAPI } from './nflDataPuller.js';
import { pullNFLResultsFromESPN, pullResultsForActiveWeeks } from './espnResultsPuller.js';
import type { IStorage } from './storage.js';
import { storage } from './storage.js';
import { eq, and, gte, lte, asc } from 'drizzle-orm';

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

    // Run every hour to check for upcoming games
    cron.schedule('0 * * * *', async () => {
      await this.checkAndScheduleDataPulls();
    });

    // Schedule weekly email reminders - every Sunday at noon (12:00 PM EST)
    cron.schedule('0 12 * * 0', async () => {
      console.log('[Scheduler] Executing weekly email reminders...');
      await this.sendWeeklyEmailReminders();
    }, {
      timezone: 'America/New_York'
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
   * Check all NFL weeks and schedule data pulls 12 hours before first game
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
      const pullTime = new Date(firstGameTime.getTime() - (12 * 60 * 60 * 1000)); // 12 hours before
      const currentTime = new Date();

      console.log(`[Scheduler] Week ${week.weekNumber}: First game at ${firstGameTime.toISOString()}, spreads available in 12 hours (data pull) scheduled for ${pullTime.toISOString()}`);

      // If the pull time has already passed, pull immediately
      if (pullTime <= currentTime) {
        console.log(`[Scheduler] Pull time for week ${week.weekNumber} has passed, executing immediately`);
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
      
      // After successful data pull, send picks unlocked notifications to active members
      await this.sendPicksUnlockedNotifications(week.weekNumber);
      
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
   * Test the scheduled job by running it as if it were 12 hours before first game
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

      console.log(`[Scheduler] Simulating data pull for week ${testWeek[0].weekNumber} as if 12 hours before first game...`);
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

  /**
   * Send picks unlocked notifications to active league members
   */
  async sendPicksUnlockedNotifications(weekNumber: number) {
    try {
      console.log(`[Scheduler] Sending picks unlocked notifications for Week ${weekNumber}...`);
      
      // Only send for regular season weeks (1-18)
      if (weekNumber < 1 || weekNumber > 18) {
        console.log(`[Scheduler] Week ${weekNumber} is not a regular season week (1-18), skipping picks unlocked notifications`);
        return;
      }
      
      // Get all active league members who want notifications
      // For testing, only send to admins
      const activeMembers = await db
        .select({
          userId: users.id,
          username: users.username,
          email: users.email,
        })
        .from(users)
        .innerJoin(leagueMembers, eq(users.id, leagueMembers.userId))
        .where(and(
          eq(leagueMembers.isActive, true),
          eq(users.receiveNotifications, true),
          eq(leagueMembers.isAdmin, true) // Only send to admins for testing
        ));

      console.log(`[Scheduler] Found ${activeMembers.length} active members to notify about picks being live`);

      let emailsSent = 0;
      let emailsFailed = 0;

      // Send picks unlocked email to each active member
      for (const member of activeMembers) {
        try {
          const success = await sendPicksUnlockedEmail(
            member.email,
            member.username,
            weekNumber
          );
          
          if (success) {
            emailsSent++;
          } else {
            emailsFailed++;
          }
        } catch (error) {
          console.error(`[Scheduler] Failed to send picks unlocked email to ${member.email}:`, error);
          emailsFailed++;
        }
      }

      console.log(`[Scheduler] Picks unlocked notifications completed: ${emailsSent} sent, ${emailsFailed} failed`);
    } catch (error) {
      console.error('[Scheduler] Error sending picks unlocked notifications:', error);
    }
  }

  /**
   * Send weekly email reminders to all league members (test version - bypasses week restrictions)
   */
  async sendWeeklyEmailRemindersTest() {
    try {
      console.log('[Scheduler] Starting weekly email reminder test (bypassing week restrictions)...');
      
      // Get the current NFL week
      const currentWeek = await db
        .select()
        .from(nflWeeks)
        .where(eq(nflWeeks.active, true))
        .limit(1);

      if (currentWeek.length === 0) {
        console.log('[Scheduler] No active NFL week found, skipping email reminders');
        return;
      }

      const week = currentWeek[0];
      console.log(`[Scheduler] Testing reminders for Week ${week.weekNumber} (test mode - ignoring week restrictions)`);

      // Get all users with their league memberships (only active members who want notifications)
      // For testing, only send to admins
      const usersWithLeagues = await db
        .select({
          userId: users.id,
          username: users.username,
          email: users.email,
          receiveNotifications: users.receiveNotifications,
          leagueId: leagueMembers.leagueId,
          leagueName: leagues.name,
          isActive: leagueMembers.isActive
        })
        .from(users)
        .innerJoin(leagueMembers, eq(users.id, leagueMembers.userId))
        .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
        .where(and(
          eq(leagueMembers.isActive, true), // Only active league members
          eq(users.receiveNotifications, true), // Only users who want notifications
          eq(leagueMembers.isAdmin, true) // Only send to admins for testing
        ));

      console.log(`[Scheduler] Found ${usersWithLeagues.length} active admin members for testing`);

      // Group users by their ID to process each user's leagues together
      const userMap = new Map<string, { user: { id: string, username: string, email: string }, leagues: Array<{ id: number, name: string }> }>();
      
      for (const row of usersWithLeagues) {
        if (!userMap.has(row.userId)) {
          userMap.set(row.userId, {
            user: { id: row.userId, username: row.username, email: row.email },
            leagues: []
          });
        }
        // Only add leagues where the user is an active member
        if (row.isActive) {
          userMap.get(row.userId)!.leagues.push({ id: row.leagueId, name: row.leagueName });
        }
      }

      let emailsSent = 0;
      let emailsFailed = 0;

      // Process each user and send appropriate email
      for (const [userId, userData] of userMap) {
        try {
          console.log(`[Scheduler] Processing user ${userData.user.username} with ${userData.leagues.length} leagues`);

          // For testing, send a simple test email
          const success = await sendWeeklyPickConfirmationEmail(
            userData.user.email,
            userData.user.username,
            week.weekNumber,
            userData.leagues.map(league => ({
              leagueName: league.name,
              teamName: "Test Team",
              teamAbbreviation: "TEST",
              spread: "+3.0"
            }))
          );

          if (success) {
            emailsSent++;
            console.log(`[Scheduler] Test email sent successfully to ${userData.user.email}`);
          } else {
            emailsFailed++;
            console.log(`[Scheduler] Failed to send test email to ${userData.user.email}`);
          }
        } catch (error) {
          console.error(`[Scheduler] Error processing user ${userData.user.username}:`, error);
          emailsFailed++;
        }
      }

      console.log(`[Scheduler] Test email reminders completed: ${emailsSent} sent, ${emailsFailed} failed`);
    } catch (error) {
      console.error('[Scheduler] Error in test email reminders:', error);
    }
  }

  /**
   * Send weekly email reminders to all league members
   */
  async sendWeeklyEmailReminders() {
    try {
      console.log('[Scheduler] Starting weekly email reminder process...');
      
      // Get the current NFL week
      const currentWeek = await db
        .select()
        .from(nflWeeks)
        .where(eq(nflWeeks.active, true))
        .limit(1);

      if (currentWeek.length === 0) {
        console.log('[Scheduler] No active NFL week found, skipping email reminders');
        return;
      }

      const week = currentWeek[0];
      
      // Only send emails for regular season weeks (1-18)
      if (week.weekNumber < 1 || week.weekNumber > 18) {
        console.log(`[Scheduler] Week ${week.weekNumber} is not a regular season week (1-18), skipping email reminders`);
        return;
      }

      console.log(`[Scheduler] Sending reminders for Week ${week.weekNumber}`);

      // Get all users with their league memberships (only active members who want notifications)
      const usersWithLeagues = await db
        .select({
          userId: users.id,
          username: users.username,
          email: users.email,
          receiveNotifications: users.receiveNotifications,
          leagueId: leagueMembers.leagueId,
          leagueName: leagues.name,
          isActive: leagueMembers.isActive
        })
        .from(users)
        .innerJoin(leagueMembers, eq(users.id, leagueMembers.userId))
        .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
        .where(and(
          eq(leagueMembers.isActive, true), // Only active league members
          eq(users.receiveNotifications, true) // Only users who want notifications
        ));

      console.log(`[Scheduler] Found ${usersWithLeagues.length} active league members with notifications enabled`);

      // Group users by their ID to process each user's leagues together
      const userMap = new Map<string, {
        user: { id: string; username: string; email: string };
        leagues: Array<{ id: number; name: string }>;
      }>();

      for (const row of usersWithLeagues) {
        if (!userMap.has(row.userId)) {
          userMap.set(row.userId, {
            user: { id: row.userId, username: row.username, email: row.email },
            leagues: []
          });
        }
        // Only add leagues where the user is an active member
        if (row.isActive) {
          userMap.get(row.userId)!.leagues.push({ id: row.leagueId, name: row.leagueName });
        }
      }

      let emailsSent = 0;
      let emailsFailed = 0;

      // Process each user
      for (const [userId, userData] of Array.from(userMap.entries())) {
        try {
          const { user, leagues: userLeagues } = userData;
          
          // Check which leagues the user has made picks for this week
          const userPicksForWeek = await db
            .select({
              leagueId: userPicks.leagueId,
              pickedTeamId: userPicks.pickedTeamId,
              teamName: nflTeams.name,
              teamAbbreviation: nflTeams.abbreviation,
              leagueName: leagues.name,
              spread: nflGames.spread
            })
            .from(userPicks)
            .innerJoin(nflTeams, eq(userPicks.pickedTeamId, nflTeams.id))
            .innerJoin(leagues, eq(userPicks.leagueId, leagues.id))
            .innerJoin(nflGames, eq(userPicks.gameId, nflGames.id))
            .where(and(
              eq(userPicks.userId, userId),
              eq(userPicks.weekId, week.id)
            ));

          const pickedLeagues = new Set(userPicksForWeek.map(pick => pick.leagueId));
          const missingLeagues = userLeagues.filter((league: { id: number; name: string }) => !pickedLeagues.has(league.id));

          if (missingLeagues.length === 0) {
            // User has picked in all leagues - send confirmation email
            const picksList = userPicksForWeek.map(pick => ({
              leagueName: pick.leagueName,
              teamName: pick.teamName,
              teamAbbreviation: pick.teamAbbreviation,
              spread: `${Number(pick.spread) > 0 ? '+' : ''}${pick.spread}`
            }));

            const success = await sendWeeklyPickConfirmationEmail(
              user.email,
              user.username,
              week.weekNumber,
              picksList
            );

            if (success) {
              console.log(`[Scheduler] Sent confirmation email to ${user.username} (${user.email})`);
              emailsSent++;
            } else {
              console.error(`[Scheduler] Failed to send confirmation email to ${user.username}`);
              emailsFailed++;
            }
          } else {
            // User is missing picks - send reminder email
            const missingLeaguesList = missingLeagues.map((league: { id: number; name: string }) => ({
              leagueName: league.name
            }));

            const success = await sendWeeklyPickReminderEmail(
              user.email,
              user.username,
              week.weekNumber,
              missingLeaguesList
            );

            if (success) {
              console.log(`[Scheduler] Sent reminder email to ${user.username} (${user.email}) - missing ${missingLeagues.length} picks`);
              emailsSent++;
            } else {
              console.error(`[Scheduler] Failed to send reminder email to ${user.username}`);
              emailsFailed++;
            }
          }
        } catch (error) {
          console.error(`[Scheduler] Error processing email for user ${userId}:`, error);
          emailsFailed++;
        }
      }

      console.log(`[Scheduler] Weekly email reminder process completed: ${emailsSent} sent, ${emailsFailed} failed`);
      
    } catch (error) {
      console.error('[Scheduler] Error in weekly email reminder process:', error);
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

  /**
   * Test the weekly email reminder system (for testing)
   */
  async testWeeklyEmails() {
    try {
      console.log('[Scheduler] Testing weekly email reminder system...');
      await this.sendWeeklyEmailReminders();
      return {
        success: true,
        message: "Weekly email test completed successfully"
      };
    } catch (error) {
      console.error('[Scheduler] Weekly email test failed:', error);
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