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
    subject: "You're in — welcome to The Upset Pool",
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
          <li><strong>Pick every single week</strong> and you stay in the end-of-season drawing. Miss one and that ticket's gone.</li>
        </ul>
        ${ctaButton('Make Your First Pick')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">Questions? Just reply to this email.</p>`
    }),
    text: `You're in — welcome to The Upset Pool

Hi ${username},

Thanks for joining The Upset Pool — the underdog prediction game. Back the longshots, and the bigger the upset, the more points you earn.

How it works:
- NFL leagues: pick one underdog each week to win outright. If they win, you earn the spread in points. Picks lock Sundays at 1:00 PM ET.
- Golf leagues: pick golfers to finish in the top 10 of a major. If they do, you earn their odds in points. Picks lock before round one.
- No points for losses — pick boldly, but pick wisely.
- Pick every single week and you stay in the end-of-season drawing. Miss one and that ticket's gone.

Make your first pick: ${SITE_URL}${TEXT_FOOTER}`
  };
}

/** Reminder for users who haven't picked yet this week (manual admin trigger). */
export function buildPickReminderEmail(username: string, weekNumber: number, deadline: string): EmailContent {
  return {
    subject: `No Week ${weekNumber} pick yet — locks Sunday 1:00 PM ET`,
    html: emailLayout({
      preheader: `Friendly nudge from the Commish: you have no Week ${weekNumber} pick in.`,
      heading: 'No Pick Yet',
      subheading: `NFL Week ${weekNumber}`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 12px 0; color: #4b5563; line-height: 1.6;">Friendly nudge from the Commish: you don't have a Week ${weekNumber} pick in. Every game is still on the board.</p>
        ${calloutBox('⏰ Picks lock', deadline)}
        ${ctaButton('Make Your Pick')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">Zero points and a dead drawing ticket is a bad Sunday. Fix it in 20 seconds.</p>`
    }),
    text: `No Week ${weekNumber} pick yet — The Upset Pool

Hi ${username},

Friendly nudge from the Commish: you don't have a Week ${weekNumber} pick in. Every game is still on the board.

Picks lock: ${deadline}

Make your pick: ${SITE_URL}

Zero points and a dead drawing ticket is a bad Sunday. Fix it in 20 seconds.${TEXT_FOOTER}`
  };
}

/** One row per league in the post-week results email. */
export interface WeeklyResultRow {
  leagueName: string;
  teamName: string;
  spread: string;        // absolute value, e.g. "6.5"
  won: boolean;
  pointsEarned: number;
  seasonTotal: number;
  rank: number;
  totalPlayers: number;
}

/** Post-week results email: the pick's outcome, points, and current place. */
export function buildWeeklyResultsEmail(username: string, weekNumber: number, rows: WeeklyResultRow[]): EmailContent {
  const first = rows[0];
  const allWon = rows.every(r => r.won);
  const anyWon = rows.some(r => r.won);

  const subject = rows.length === 1
    ? (first.won
        ? `You hit! ${first.teamName} +${first.spread} pays out — Week ${weekNumber} results`
        : `Week ${weekNumber} results — the ${first.teamName} let you down`)
    : `Week ${weekNumber} results — The Upset Pool`;

  const preheader = first.won
    ? `+${first.pointsEarned} points. You're ${ordinal(first.rank)} of ${first.totalPlayers}.`
    : `No points this week. Still ${ordinal(first.rank)} of ${first.totalPlayers}.`;

  const rowsHtml = rows.map(r => `
        <div style="background-color: ${r.won ? '#ecfdf5' : '#f3f4f6'}; border: 1px solid ${r.won ? '#a7f3d0' : '#e5e7eb'}; padding: 14px 16px; margin: 10px 0; border-radius: 10px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">${r.leagueName}</p>
          <p style="margin: 0 0 6px 0; font-size: 17px; font-weight: 700; color: #1f2937;">
            ${r.teamName} +${r.spread} — ${r.won ? `<span style="color: #047857;">hit for +${r.pointsEarned} points</span>` : `<span style="color: #b91c1c;">didn't get it done</span>`}
          </p>
          <p style="margin: 0; font-size: 13px; color: #4b5563;">
            Season total <strong>${r.seasonTotal}</strong> · sitting <strong>${ordinal(r.rank)} of ${r.totalPlayers}</strong>
          </p>
        </div>`).join('');

  const rowsPlain = rows.map(r =>
    `- ${r.leagueName}: ${r.teamName} +${r.spread} — ${r.won ? `hit for +${r.pointsEarned} points` : "didn't get it done"}. Season total ${r.seasonTotal}, ${ordinal(r.rank)} of ${r.totalPlayers}.`
  ).join('\n');

  const closer = weekNumber < 18
    ? `Week ${weekNumber + 1} spreads post Thursday morning.`
    : `That's the season. Thanks for playing — drawings and payouts to follow.`;

  return {
    subject,
    html: emailLayout({
      preheader,
      heading: allWon ? 'Your Dog Came Through' : anyWon ? `Week ${weekNumber} Results` : 'Not This Week',
      subheading: `NFL Week ${weekNumber}`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        ${rowsHtml}
        ${ctaButton('See the Full Leaderboard')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">${closer}</p>`
    }),
    text: `Week ${weekNumber} results — The Upset Pool

Hi ${username},

${rowsPlain}

Full leaderboard: ${SITE_URL}

${closer}${TEXT_FOOTER}`
  };
}

function ordinal(n: number): string {
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
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

  const subject = userPicks.length === 1
    ? `You're in: ${userPicks[0].teamName} ${userPicks[0].spread} — locks 1:00 PM ET`
    : `Your Week ${weekNumber} picks are in — lock at 1:00 PM ET`;

  return {
    subject,
    html: emailLayout({
      preheader: `Your Week ${weekNumber} pick is saved, and there's still time to change your mind.`,
      heading: userPicks.length === 1 ? 'Your Pick Is In' : 'Your Picks Are In',
      subheading: `NFL Week ${weekNumber}`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; line-height: 1.6;">Saved for Week ${weekNumber}:</p>
        ${picksListHtml}
        ${calloutBox('Change of heart?', 'You have until 1:00 PM ET today — unless your game kicks off first, in which case you\'re already riding.')}
        ${ctaButton(userPicks.length === 1 ? 'View Your Pick' : 'View Your Picks')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">Go dogs. — The Upset Pool</p>`
    }),
    text: `${subject}

Hi ${username},

Saved for Week ${weekNumber}:
${picksListPlain}

Change of heart? You have until 1:00 PM ET today — unless your game kicks off first, in which case you're already riding.

View your pick: ${SITE_URL}

Go dogs. — The Upset Pool${TEXT_FOOTER}`
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
    subject: `⏳ 1 hour left — you have no Week ${weekNumber} pick`,
    html: emailLayout({
      preheader: `Picks lock at 1:00 PM ET and you're not in. One missed week ends your drawing run.`,
      heading: 'Picks Lock in 1 Hour',
      subheading: `NFL Week ${weekNumber}`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 16px 0; color: #4b5563; line-height: 1.6;">Picks lock at <strong style="color: #dc2626;">1:00 PM ET</strong>. Right now you're getting zero points this week — and one missed week ends your run at the pick-every-week drawing. For the whole season. ${leagueCountNote}</p>
        ${leaguesHtml}
        ${ctaButton('Pick Now')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">Takes about 20 seconds. Any dog will do.</p>`
    }),
    text: `1 hour left — you have no Week ${weekNumber} pick

Hi ${username},

Picks lock at 1:00 PM ET. Right now you're getting zero points this week — and one missed week ends your run at the pick-every-week drawing. For the whole season. ${leagueCountNote}
${leaguesPlain}

Pick now: ${SITE_URL}

Takes about 20 seconds. Any dog will do.${TEXT_FOOTER}`
  };
}

/** Notification that spreads are posted and picks are open for the week. */
export function buildPicksUnlockedEmail(username: string, weekNumber: number): EmailContent {
  return {
    subject: `🏈 Week ${weekNumber} is open — pick your underdog`,
    html: emailLayout({
      preheader: `The Week ${weekNumber} spreads just posted. Find the dog that wins outright.`,
      heading: 'Week Is Open',
      subheading: `NFL Week ${weekNumber} spreads are posted`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 16px 0; color: #4b5563; line-height: 1.6;">The Week ${weekNumber} spreads just posted. Sixteen games, one pick — find the dog that's going to win outright.</p>
        ${calloutBox('⏰ Picks lock Sunday at 1:00 PM ET', 'Or at kickoff if you take a Thursday or Saturday game.')}
        ${ctaButton('Pick Your Underdog')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">Win outright and you earn the spread. Covering doesn't count.</p>`
    }),
    text: `Week ${weekNumber} is open — pick your underdog

Hi ${username},

The Week ${weekNumber} spreads just posted. Sixteen games, one pick — find the dog that's going to win outright.

Picks lock Sunday at 1:00 PM ET, or at kickoff if you take a Thursday or Saturday game.

Pick your underdog: ${SITE_URL}

Win outright and you earn the spread. Covering doesn't count.${TEXT_FOOTER}`
  };
}

/** Notice sent to league members when an admin archives the league. */
export function buildLeagueArchivedEmail(username: string, leagueName: string): EmailContent {
  return {
    subject: `${leagueName} moved to Past Seasons`,
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

export async function sendWeeklyResultsEmail(email: string, username: string, weekNumber: number, rows: WeeklyResultRow[]): Promise<boolean> {
  return sendEmail({ to: email, ...buildWeeklyResultsEmail(username, weekNumber, rows) });
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
