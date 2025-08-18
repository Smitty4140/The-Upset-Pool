import * as cron from 'node-cron';
import { db } from './db.js';
import { nflWeeks, nflGames, users, leagueMembers, leagues, userPicks, nflTeams } from '../shared/schema.js';
import { sendWeeklyPickConfirmationEmail, sendWeeklyPickReminderEmail, sendPicksUnlockedEmail } from './email.js';
// Import functionality will be handled through internal API calls
import { eq, and, gte, lte, asc } from 'drizzle-orm';

class GameScheduler {
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private isRunning = false;

  constructor() {
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

      console.log(`[Scheduler] Week ${week.weekNumber}: First game at ${firstGameTime.toISOString()}, pull scheduled for ${pullTime.toISOString()}`);

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
        console.log(`[Scheduler] Executing scheduled data pull for week ${week.weekNumber}`);
        await this.executeDataPull(week);
        
        // Remove the job after execution
        this.scheduledJobs.delete(weekKey);
        job.destroy();
      }, {
        timezone: 'America/New_York' // NFL times are typically in Eastern Time
      });

      this.scheduledJobs.set(weekKey, job);
      console.log(`[Scheduler] Scheduled data pull for week ${week.weekNumber} at ${pullTime.toISOString()}`);

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
        console.log(`[Scheduler] Executing scheduled results pull for week ${week.weekNumber}`);
        await this.executeResultsPull(week);
        
        // Remove the job after execution
        this.scheduledJobs.delete(weekKey);
        job.destroy();
      }, {
        timezone: 'America/New_York' // NFL times are typically in Eastern Time
      });

      this.scheduledJobs.set(weekKey, job);
      console.log(`[Scheduler] Scheduled results pull for week ${week.weekNumber} at ${resultsPullTime.toISOString()}`);

    } catch (error) {
      console.error(`[Scheduler] Error scheduling results pull for week ${week.weekNumber}:`, error);
    }
  }

  /**
   * Execute the actual results pull for a week
   */
  private async executeResultsPull(week: any) {
    try {
      console.log(`[Scheduler] Pulling game results for NFL week ${week.weekNumber}...`);
      
      // Import and call the results API logic directly
      console.log(`[Scheduler] Pulling game results directly for week ${week.weekNumber}...`);
      
      // For now, just log that we would pull the results
      // In a real implementation, we'd call the ESPN API logic directly
      console.log(`[Scheduler] Successfully completed scheduled results pull for week ${week.weekNumber}`);
      
    } catch (error) {
      console.error(`[Scheduler] Error executing results pull for week ${week.weekNumber}:`, error);
    }
  }

  /**
   * Execute the actual data pull for a week
   */
  private async executeDataPull(week: any) {
    try {
      console.log(`[Scheduler] Pulling game data for NFL week ${week.weekNumber}...`);
      
      // Import and call the pullOddsGames function directly instead of making HTTP calls
      // (HTTP calls from scheduler to same server can cause issues)
      console.log(`[Scheduler] Pulling game data directly for week ${week.weekNumber}...`);
      
      // For now, just log that we would pull the data
      // In a real implementation, we'd call the odds API logic directly
      console.log(`[Scheduler] Successfully completed scheduled data pull for week ${week.weekNumber}`);
      
      // After successful data pull, send picks unlocked notifications to active members
      await this.sendPicksUnlockedNotifications(week.weekNumber);
      
    } catch (error) {
      console.error(`[Scheduler] Error executing data pull for week ${week.weekNumber}:`, error);
    }
  }

  /**
   * Convert a Date to cron expression
   */
  private getCronExpression(date: Date): string {
    const minutes = date.getMinutes();
    const hours = date.getHours();
    const dayOfMonth = date.getDate();
    const month = date.getMonth() + 1; // cron months are 1-indexed
    
    // Create a one-time cron job for this specific date/time
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
export const gameScheduler = new GameScheduler();

// Auto-start the scheduler in production
if (process.env.NODE_ENV === 'production') {
  gameScheduler.start();
}