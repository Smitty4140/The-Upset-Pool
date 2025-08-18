import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable is not set. Email functionality will be disabled.");
}

const mailService = new MailService();

if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}

interface EmailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Send an email using SendGrid
 * @param params Email parameters
 * @returns Success status
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("Cannot send email: SENDGRID_API_KEY is not set");
    return false;
  }

  try {
    await mailService.send({
      to: params.to,
      from: process.env.SENDGRID_FROM_EMAIL || 'notifications@nflupsetpool.com', // Change to your verified sender
      subject: params.subject,
      text: params.text || '',
      html: params.html || params.text || '',
    });
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

/**
 * Send a welcome email to a new user
 */
export async function sendWelcomeEmail(email: string, username: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Welcome to NFL Upset Pool!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">Welcome to NFL Upset Pool!</h1>
        <p>Hi ${username},</p>
        <p>Thank you for joining NFL Upset Pool! We're excited to have you compete in our underdog prediction challenge.</p>
        <h2 style="color: #4b5563;">How It Works:</h2>
        <ul>
          <li>Each week, select one underdog team to win outright</li>
          <li>Earn points equal to the spread if your team wins</li>
          <li>No points are awarded for losses</li>
          <li>All picks lock at 1 PM EST on Sundays</li>
        </ul>
        <p>Good luck with your picks!</p>
        <a href="https://nflupsetpool.com" style="display: inline-block; background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px;">Make Your First Pick</a>
        <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">If you have any questions, please don't hesitate to contact us.</p>
      </div>
    `
  });
}

/**
 * Send a reminder to users who haven't made a pick for the current week
 */
export async function sendPickReminderEmail(email: string, username: string, weekNumber: number, deadline: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `Week ${weekNumber} NFL Upset Pool Pick Reminder`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">NFL Upset Pool Pick Reminder</h1>
        <p>Hi ${username},</p>
        <p>This is a friendly reminder that you haven't made your Week ${weekNumber} underdog pick yet!</p>
        <p><strong>Deadline:</strong> ${deadline}</p>
        <p>Don't miss your chance to earn points - make your selection now!</p>
        <a href="https://nflupsetpool.com" style="display: inline-block; background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px;">Make Your Pick</a>
        <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">If you believe you've received this email in error, please disregard.</p>
      </div>
    `
  });
}

/**
 * Send a weekly results email to users
 */
export async function sendWeeklyResultsEmail(email: string, username: string, weekNumber: number, userPick: any, userPoints: number): Promise<boolean> {
  const resultText = userPick.isCorrect 
    ? `Congratulations! Your pick (${userPick.teamName}) won and you earned ${userPoints} points!` 
    : `Unfortunately, your pick (${userPick.teamName}) didn't win this week.`;

  return sendEmail({
    to: email,
    subject: `Week ${weekNumber} NFL Upset Pool Results`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #3b82f6;">Your Week ${weekNumber} Results</h1>
        <p>Hi ${username},</p>
        <p>${resultText}</p>
        <p>Check the leaderboard to see how you stack up against the competition!</p>
        <a href="https://nflupsetpool.com/leaderboard" style="display: inline-block; background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px;">View Leaderboard</a>
        <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">Good luck with your Week ${weekNumber + 1} pick!</p>
      </div>
    `
  });
}

/**
 * Send a stylized weekly reminder email for users who have made picks in all leagues
 */
export async function sendWeeklyPickConfirmationEmail(
  email: string, 
  username: string, 
  weekNumber: number,
  userPicks: Array<{
    leagueName: string;
    teamName: string;
    teamAbbreviation: string;
    spread: string;
  }>
): Promise<boolean> {
  const picksList = userPicks.map(pick => 
    `<div style="background-color: #f3f4f6; padding: 12px; margin: 8px 0; border-radius: 8px;">
      <strong>${pick.leagueName}:</strong> ${pick.teamName} (${pick.teamAbbreviation}) ${pick.spread}
    </div>`
  ).join('');

  return sendEmail({
    to: email,
    subject: 'Reminder: Upset Pool picks lock at 1pm',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); color: white; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 24px;">🏈 NFL Upset Pool</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">Week ${weekNumber} Pick Confirmation</p>
        </div>
        
        <div style="background-color: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 20px;">
          <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${username},</p>
          <p style="margin: 0 0 20px 0; color: #4b5563;">Your Week ${weekNumber} picks are locked in! Here's what you've selected:</p>
          
          ${picksList}
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; color: #92400e; font-weight: 600;">⏰ Final Reminder</p>
            <p style="margin: 8px 0 0 0; color: #92400e;">All picks lock at 1:00 PM EST today. No changes can be made after this time.</p>
          </div>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="https://nflupsetpool.com" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
            View Upset Pool
          </a>
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #6b7280;">Good luck with your picks! May the underdogs be with you. 🎯</p>
        </div>
      </div>
    `
  });
}

/**
 * Send a stylized weekly reminder email for users who need to make picks
 */
export async function sendWeeklyPickReminderEmail(
  email: string, 
  username: string, 
  weekNumber: number,
  missingLeagues: Array<{
    leagueName: string;
  }>
): Promise<boolean> {
  const leaguesList = missingLeagues.map(league => 
    `<li style="color: #dc2626; font-weight: 500; margin: 4px 0;">${league.leagueName}</li>`
  ).join('');

  return sendEmail({
    to: email,
    subject: 'Reminder: Upset Pool pick needed!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 24px;">🚨 NFL Upset Pool</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">Pick Required - Week ${weekNumber}</p>
        </div>
        
        <div style="background-color: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 20px;">
          <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${username},</p>
          <p style="margin: 0 0 20px 0; color: #4b5563;">You haven't made your Week ${weekNumber} upset pool pick yet! Don't miss out on the action.</p>
          
          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0 0 12px 0; color: #dc2626; font-weight: 600;">⚠️ Missing Picks For:</p>
            <ul style="margin: 0; padding-left: 20px; color: #dc2626;">
              ${leaguesList}
            </ul>
          </div>

          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; color: #92400e; font-weight: 600;">⏰ Deadline Approaching</p>
            <p style="margin: 8px 0 0 0; color: #92400e;">All picks lock at 1:00 PM EST today. Make your selection before it's too late!</p>
          </div>

          <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; color: #0369a1; font-weight: 600;">📋 Quick Reminder:</p>
            <ul style="margin: 0; padding-left: 20px; color: #0369a1; font-size: 14px;">
              <li>Pick one underdog team to win outright</li>
              <li>Earn points equal to the spread if your team wins</li>
              <li>No points for losses - choose wisely!</li>
            </ul>
          </div>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="https://nflupsetpool.com" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; box-shadow: 0 4px 6px rgba(220, 38, 38, 0.3);">
            Make Your Pick Now
          </a>
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #6b7280;">Don't let the underdogs slip away! Make your pick today. 🎯</p>
        </div>
      </div>
    `
  });
}

/**
 * Send a picks unlocked notification email
 */
export async function sendPicksUnlockedEmail(
  email: string,
  username: string,
  weekNumber: number
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `🏈 Upset Pool Picks Are Live! - Week ${weekNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1a365d 0%, #2d5a87 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 12px; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 28px; font-weight: bold;">🏈 Picks Are Live!</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">NFL Week ${weekNumber} is ready for your predictions</p>
        </div>
        
        <div style="background-color: #ffffff; padding: 30px 20px; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 20px;">
          <div style="background-color: #f0f8ff; border-left: 4px solid #2d5a87; padding: 20px; margin-bottom: 25px; border-radius: 0 8px 8px 0;">
            <h2 style="color: #1a365d; margin: 0 0 10px 0; font-size: 24px;">Upset Pool Picks Are Live!</h2>
            <p style="color: #4a5568; margin: 0; font-size: 16px; line-height: 1.5;">Hello ${username}! The picks for NFL Week ${weekNumber} have been unlocked and are now available. Time to make your upset predictions and compete for the top of the leaderboard!</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.REPLIT_DEV_DOMAIN || 'https://your-app.replit.app'}" style="display: inline-block; background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; box-shadow: 0 4px 12px rgba(229, 62, 62, 0.3);">
              Make Your Picks Now
            </a>
          </div>
          
          <p style="color: #718096; font-size: 14px; text-align: center; margin-top: 30px;">
            Remember: Pick the underdog teams you think will win straight up. Points are awarded based on the spread!
          </p>
        </div>
        
        <div style="background-color: #2d3748; color: #a0aec0; padding: 20px; text-align: center; font-size: 14px; border-radius: 8px;">
          <p style="margin: 0;">NFL Upset Pool</p>
        </div>
      </div>
    `,
    text: `🏈 Upset Pool Picks Are Live! - Week ${weekNumber}

Hello ${username}!

The picks for NFL Week ${weekNumber} have been unlocked and are now available. Time to make your upset predictions and compete for the top of the leaderboard!

Log in to make your picks: ${process.env.REPLIT_DEV_DOMAIN || 'https://your-app.replit.app'}

Remember: Pick the underdog teams you think will win straight up. Points are awarded based on the spread!

Good luck!

NFL Upset Pool`
  });
}