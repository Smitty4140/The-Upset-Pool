import * as SibApiV3Sdk from '@sendinblue/client';

if (!process.env.BREVO_API_KEY) {
  console.warn("BREVO_API_KEY environment variable is not set. Email functionality will be disabled.");
}
if (!process.env.BREVO_FROM_EMAIL) {
  console.warn("BREVO_FROM_EMAIL environment variable is not set. Emails will NOT be sent until it is configured with a Brevo-verified sender address.");
}

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY || '');

// ---------------------------------------------------------------------------
// Shared branding
// ---------------------------------------------------------------------------

const SITE_URL = 'https://upsetpool.com';
const LOGO_URL = `${SITE_URL}/email-logo.png`;

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

interface EmailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/** Branded call-to-action button. */
function ctaButton(label: string, href: string = SITE_URL): string {
  return `
      <div style="text-align: center; margin: 32px 0;">
        <a href="${href}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 17px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);">
          ${label}
        </a>
      </div>`;
}

/** Highlighted callout box (amber). */
function calloutBox(title: string, body: string): string {
  return `
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #92400e; font-weight: 600;">${title}</p>
        <p style="margin: 8px 0 0 0; color: #92400e;">${body}</p>
      </div>`;
}

/**
 * Shared branded layout: navy header with the Upset Pool logo, white content
 * card, dark footer with a notification-preferences note.
 */
function emailLayout(opts: { preheader?: string; heading: string; subheading?: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  ${opts.preheader ? `<div style="display: none; max-height: 0; overflow: hidden;">${opts.preheader}</div>` : ''}
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); border-radius: 16px 16px 0 0; padding: 28px 24px; text-align: center;">
      <img src="${LOGO_URL}" alt="The Upset Pool" style="width: 72px; height: 72px; margin-bottom: 10px;" />
      <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">${opts.heading}</h1>
      ${opts.subheading ? `<p style="margin: 8px 0 0 0; color: #cbd5e1; font-size: 15px;">${opts.subheading}</p>` : ''}
    </div>

    <!-- Content -->
    <div style="background-color: #ffffff; padding: 28px 24px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
      ${opts.bodyHtml}
    </div>

    <!-- Footer -->
    <div style="background-color: #1f2937; border-radius: 0 0 16px 16px; padding: 20px 24px; text-align: center;">
      <p style="margin: 0 0 6px 0; color: #9ca3af; font-size: 12px;">
        The Upset Pool &middot; <a href="${SITE_URL}" style="color: #60a5fa; text-decoration: none;">upsetpool.com</a>
      </p>
      <p style="margin: 0; color: #6b7280; font-size: 11px;">
        You can manage email notifications in your <a href="${SITE_URL}" style="color: #60a5fa; text-decoration: none;">profile settings</a>.
      </p>
    </div>

  </div>
</body>
</html>`;
}

const TEXT_FOOTER = `\n\n—\nThe Upset Pool · ${SITE_URL}\nManage email notifications in your profile settings.`;

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * Send an email using Brevo (Sendinblue).
 * Requires both BREVO_API_KEY and BREVO_FROM_EMAIL (a Brevo-verified sender).
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!process.env.BREVO_API_KEY) {
    console.warn("Cannot send email: BREVO_API_KEY is not set");
    return false;
  }
  if (!process.env.BREVO_FROM_EMAIL) {
    console.error("Cannot send email: BREVO_FROM_EMAIL is not set. Configure a Brevo-verified sender address.");
    return false;
  }

  try {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.sender = {
      name: 'The Upset Pool',
      email: process.env.BREVO_FROM_EMAIL
    };

    sendSmtpEmail.to = [{
      email: params.to
    }];

    sendSmtpEmail.subject = params.subject;
    sendSmtpEmail.textContent = params.text || 'View this email in HTML format for the full experience.';
    sendSmtpEmail.htmlContent = params.html || params.text || '';

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`[Email] Brevo response:`, result.body);
    return true;
  } catch (error) {
    console.error('Brevo email error:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Templates (exported builders so previews/tests can render without sending)
// ---------------------------------------------------------------------------

/** Welcome email — sport-neutral (users may join NFL or golf leagues). */
export function buildWelcomeEmail(username: string): EmailContent {
  return {
    subject: 'Welcome to The Upset Pool!',
    html: emailLayout({
      preheader: 'Pick underdogs. Earn points when they come through.',
      heading: 'Welcome to The Upset Pool!',
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; line-height: 1.6;">Thanks for joining The Upset Pool — the underdog prediction game. The idea is simple: back the longshots, and the bigger the upset, the more points you earn.</p>
        <h2 style="color: #1e3a5f; font-size: 18px; margin: 0 0 12px 0;">How it works</h2>
        <ul style="color: #4b5563; line-height: 1.8; margin: 0 0 8px 0; padding-left: 20px;">
          <li><strong>NFL leagues:</strong> pick one underdog each week to win outright. If they win, you earn the spread in points. Picks lock Sundays at 1:00 PM ET.</li>
          <li><strong>Golf leagues:</strong> pick golfers to finish in the top 10 of a major. If they do, you earn their odds in points. Picks lock before round one tees off.</li>
          <li>No points for losses — pick boldly, but pick wisely.</li>
        </ul>
        ${ctaButton('Make Your First Pick')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">Questions? Just reply to this email.</p>`
    }),
    text: `Welcome to The Upset Pool!

Hi ${username},

Thanks for joining The Upset Pool — the underdog prediction game. Back the longshots, and the bigger the upset, the more points you earn.

How it works:
- NFL leagues: pick one underdog each week to win outright. If they win, you earn the spread in points. Picks lock Sundays at 1:00 PM ET.
- Golf leagues: pick golfers to finish in the top 10 of a major. If they do, you earn their odds in points. Picks lock before round one.
- No points for losses — pick boldly, but pick wisely.

Make your first pick: ${SITE_URL}${TEXT_FOOTER}`
  };
}

/** Reminder for users who haven't picked yet this week (manual admin trigger). */
export function buildPickReminderEmail(username: string, weekNumber: number, deadline: string): EmailContent {
  return {
    subject: `Week ${weekNumber} Pick Reminder — The Upset Pool`,
    html: emailLayout({
      preheader: `You haven't made your Week ${weekNumber} pick yet.`,
      heading: 'Pick Reminder',
      subheading: `NFL Week ${weekNumber}`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 12px 0; color: #4b5563; line-height: 1.6;">You haven't made your Week ${weekNumber} underdog pick yet!</p>
        ${calloutBox('⏰ Deadline', deadline)}
        <p style="margin: 0 0 8px 0; color: #4b5563;">Don't miss your chance to earn points — make your selection now.</p>
        ${ctaButton('Make Your Pick')}`
    }),
    text: `Pick Reminder — NFL Week ${weekNumber}

Hi ${username},

You haven't made your Week ${weekNumber} underdog pick yet!

Deadline: ${deadline}

Make your pick: ${SITE_URL}${TEXT_FOOTER}`
  };
}

/** Weekly results email (currently not scheduled anywhere). */
export function buildWeeklyResultsEmail(username: string, weekNumber: number, userPick: any, userPoints: number): EmailContent {
  const resultText = userPick.isCorrect
    ? `Congratulations! Your pick (${userPick.teamName}) won and you earned <strong>${userPoints} points</strong>!`
    : `Unfortunately, your pick (${userPick.teamName}) didn't win this week.`;
  const resultTextPlain = userPick.isCorrect
    ? `Congratulations! Your pick (${userPick.teamName}) won and you earned ${userPoints} points!`
    : `Unfortunately, your pick (${userPick.teamName}) didn't win this week.`;
  const nextWeekNote = weekNumber < 18
    ? `Good luck with your Week ${weekNumber + 1} pick!`
    : `That's a wrap on the season — thanks for playing!`;

  return {
    subject: `Week ${weekNumber} Results — The Upset Pool`,
    html: emailLayout({
      preheader: resultTextPlain,
      heading: `Week ${weekNumber} Results`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 16px 0; color: #4b5563; line-height: 1.6;">${resultText}</p>
        <p style="margin: 0 0 8px 0; color: #4b5563;">Check the leaderboard to see how you stack up against the competition.</p>
        ${ctaButton('View Leaderboard')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">${nextWeekNote}</p>`
    }),
    text: `Week ${weekNumber} Results — The Upset Pool

Hi ${username},

${resultTextPlain}

Check the leaderboard: ${SITE_URL}

${nextWeekNote}${TEXT_FOOTER}`
  };
}

/** Sunday-noon confirmation for users who have made all their picks. */
export function buildWeeklyPickConfirmationEmail(
  username: string,
  weekNumber: number,
  userPicks: Array<{ leagueName: string; teamName: string; teamAbbreviation: string; spread: string }>
): EmailContent {
  const picksListHtml = userPicks.map(pick =>
    `<div style="background-color: #f3f4f6; padding: 12px; margin: 8px 0; border-radius: 8px; color: #1f2937;">
      <strong>${pick.leagueName}:</strong> ${pick.teamName} (${pick.teamAbbreviation}) ${pick.spread}
    </div>`
  ).join('');
  const picksListPlain = userPicks.map(p => `- ${p.leagueName}: ${p.teamName} (${p.teamAbbreviation}) ${p.spread}`).join('\n');

  return {
    subject: `Your Week ${weekNumber} picks are in — locks at 1:00 PM ET`,
    html: emailLayout({
      preheader: `Your Week ${weekNumber} picks, and one hour to change your mind.`,
      heading: 'Your Picks Are In',
      subheading: `NFL Week ${weekNumber}`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; line-height: 1.6;">Here's what you've selected for Week ${weekNumber}:</p>
        ${picksListHtml}
        ${calloutBox('⏰ Locks at 1:00 PM ET today', 'You can still change your picks until then. After that, they\'re final.')}
        ${ctaButton('View Your Picks')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">Good luck! May the underdogs be with you. 🎯</p>`
    }),
    text: `Your Week ${weekNumber} picks are in — The Upset Pool

Hi ${username},

Here's what you've selected for Week ${weekNumber}:
${picksListPlain}

Picks lock at 1:00 PM ET today. You can still change them until then.

View your picks: ${SITE_URL}${TEXT_FOOTER}`
  };
}

/** Sunday-noon reminder for users still missing picks in one or more leagues. */
export function buildWeeklyPickReminderEmail(
  username: string,
  weekNumber: number,
  missingLeagues: Array<{ leagueName: string }>
): EmailContent {
  const leaguesHtml = missingLeagues.map(l =>
    `<div style="background-color: #fef2f2; padding: 10px 16px; margin: 6px 0; border-radius: 6px; color: #991b1b; font-weight: 500;">${l.leagueName}</div>`
  ).join('');
  const leaguesPlain = missingLeagues.map(l => `- ${l.leagueName}`).join('\n');
  const leagueCountNote = missingLeagues.length === 1
    ? 'You still need a pick in this league:'
    : `You still need picks in ${missingLeagues.length} leagues:`;

  return {
    subject: `Picks lock in 1 hour — Week ${weekNumber}`,
    html: emailLayout({
      preheader: `One hour until Week ${weekNumber} picks lock. You're not in yet.`,
      heading: 'Picks Lock in 1 Hour!',
      subheading: `NFL Week ${weekNumber}`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 16px 0; color: #4b5563; line-height: 1.6;">One hour until picks are <strong style="color: #dc2626;">locked in</strong> at 1:00 PM ET. ${leagueCountNote}</p>
        ${leaguesHtml}
        ${ctaButton('Make Your Pick Now')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">No pick means no points this week — don't leave them on the table.</p>`
    }),
    text: `Picks lock in 1 hour — NFL Week ${weekNumber}

Hi ${username},

One hour until picks lock at 1:00 PM ET. ${leagueCountNote}
${leaguesPlain}

Make your pick now: ${SITE_URL}${TEXT_FOOTER}`
  };
}

/** Notification that spreads are posted and picks are open for the week. */
export function buildPicksUnlockedEmail(username: string, weekNumber: number): EmailContent {
  return {
    subject: `🏈 Picks are live — Week ${weekNumber}`,
    html: emailLayout({
      preheader: `NFL Week ${weekNumber} spreads are posted. Make your picks.`,
      heading: 'Picks Are Live!',
      subheading: `NFL Week ${weekNumber} is ready for your predictions`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 16px 0; color: #4b5563; line-height: 1.6;">The spreads for NFL Week ${weekNumber} are posted and picks are now open. Time to find this week's upset and climb the leaderboard.</p>
        ${ctaButton('Make Your Picks Now')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">Pick an underdog to win straight up — points are awarded based on the spread.</p>`
    }),
    text: `Picks are live — NFL Week ${weekNumber}

Hi ${username},

The spreads for NFL Week ${weekNumber} are posted and picks are now open.

Make your picks: ${SITE_URL}

Pick an underdog to win straight up — points are awarded based on the spread.${TEXT_FOOTER}`
  };
}

/** Notice sent to league members when an admin archives the league. */
export function buildLeagueArchivedEmail(username: string, leagueName: string): EmailContent {
  return {
    subject: `${leagueName} has been archived — The Upset Pool`,
    html: emailLayout({
      preheader: `${leagueName} has moved to Past Seasons.`,
      heading: 'League Archived',
      subheading: leagueName,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 12px 0; color: #4b5563; line-height: 1.6;">Your league admin has archived <strong>${leagueName}</strong>.</p>
        ${calloutBox('📦 What this means', `The league now appears under "Past Seasons" on your home screen instead of your active leagues. You can still view all results and standings — nothing has been deleted.`)}
        <p style="margin: 0 0 8px 0; color: #4b5563; line-height: 1.6;">If the league is restored by an admin, it will move back to your active list automatically.</p>
        ${ctaButton('View Past Seasons')}`
    }),
    text: `League Archived — ${leagueName}

Hi ${username},

Your league admin has archived ${leagueName}.

What this means: the league now appears under "Past Seasons" on your home screen instead of your active leagues. You can still view all results and standings — nothing has been deleted.

If the league is restored by an admin, it will move back to your active list automatically.

View past seasons: ${SITE_URL}${TEXT_FOOTER}`
  };
}

// ---------------------------------------------------------------------------
// Send functions (signatures unchanged for existing callers)
// ---------------------------------------------------------------------------

export async function sendLeagueArchivedEmail(email: string, username: string, leagueName: string): Promise<boolean> {
  return sendEmail({ to: email, ...buildLeagueArchivedEmail(username, leagueName) });
}

export async function sendWelcomeEmail(email: string, username: string): Promise<boolean> {
  return sendEmail({ to: email, ...buildWelcomeEmail(username) });
}

export async function sendPickReminderEmail(email: string, username: string, weekNumber: number, deadline: string): Promise<boolean> {
  return sendEmail({ to: email, ...buildPickReminderEmail(username, weekNumber, deadline) });
}

export async function sendWeeklyResultsEmail(email: string, username: string, weekNumber: number, userPick: any, userPoints: number): Promise<boolean> {
  return sendEmail({ to: email, ...buildWeeklyResultsEmail(username, weekNumber, userPick, userPoints) });
}

export async function sendWeeklyPickConfirmationEmail(
  email: string,
  username: string,
  weekNumber: number,
  userPicks: Array<{ leagueName: string; teamName: string; teamAbbreviation: string; spread: string }>
): Promise<boolean> {
  return sendEmail({ to: email, ...buildWeeklyPickConfirmationEmail(username, weekNumber, userPicks) });
}

export async function sendWeeklyPickReminderEmail(
  email: string,
  username: string,
  weekNumber: number,
  missingLeagues: Array<{ leagueName: string }>
): Promise<boolean> {
  return sendEmail({ to: email, ...buildWeeklyPickReminderEmail(username, weekNumber, missingLeagues) });
}

export async function sendPicksUnlockedEmail(
  email: string,
  username: string,
  weekNumber: number
): Promise<boolean> {
  return sendEmail({ to: email, ...buildPicksUnlockedEmail(username, weekNumber) });
}
