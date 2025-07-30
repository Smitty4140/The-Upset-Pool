import * as cron from 'node-cron';
import { db } from './db.js';
import { nflWeeks, nflGames } from '../shared/schema.js';
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
   * Execute the actual data pull for a week
   */
  private async executeDataPull(week: any) {
    try {
      console.log(`[Scheduler] Pulling game data for NFL week ${week.weekNumber}...`);
      
      // Make an internal API call to pull games from The Odds API
      const response = await fetch(`http://localhost:5000/api/admin/week/${week.id}/pull-games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`[Scheduler] Successfully pulled data for week ${week.weekNumber}: ${result.gamesUpdated || 0} games updated`);
      } else {
        const errorText = await response.text();
        console.error(`[Scheduler] Failed to pull data for week ${week.weekNumber}: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
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

      // Make internal API call to pull games
      const response = await fetch(`http://localhost:5000/api/admin/week/${testWeek[0].id}/pull-games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`[Scheduler] Manual pull completed: ${result.gamesUpdated} games updated`);
        return {
          success: true,
          weekNumber: testWeek[0].weekNumber,
          gamesUpdated: result.gamesUpdated
        };
      } else {
        throw new Error(`API call failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('[Scheduler] Manual pull failed:', error);
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