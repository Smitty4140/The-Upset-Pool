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
      from: 'notifications@nflupsetpool.com', // Change to your verified sender
      subject: params.subject,
      text: params.text,
      html: params.html || params.text,
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