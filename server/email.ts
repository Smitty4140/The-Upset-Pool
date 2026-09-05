if (!process.env.BREVO_API_KEY) {
  console.warn("BREVO_API_KEY environment variable is not set. Email functionality will be disabled.");
}
if (!process.env.BREVO_FROM_EMAIL) {
  console.warn("BREVO_FROM_EMAIL environment variable is not set. Emails will NOT be sent until it is configured with a Brevo-verified sender address.");
}

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
 * Send an email through Brevo's transactional REST API.
 * Requires a protected API key and a Brevo-verified sender address.
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!process.env.BREVO_API_KEY) {
    console.error("Cannot send email: BREVO_API_KEY is not set.");
    return false;
  }
  if (!process.env.BREVO_FROM_EMAIL) {
    console.error("Cannot send email: BREVO_FROM_EMAIL is not set. Configure a Brevo-verified sender address.");
    return false;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "The Upset Pool",
          email: process.env.BREVO_FROM_EMAIL,
        },
        to: [{ email: params.to }],
        subject: params.subject,
        textContent: params.text || "View this email in HTML format for the full experience.",
        htmlContent: params.html || params.text || "",
      }),
    });

    const result = await response.json().catch(() => null) as {
      messageId?: string;
      code?: string;
      message?: string;
    } | null;

    if (!response.ok) {
      console.error("[Email] Brevo send failed", {
        status: response.status,
        code: result?.code,
        message: result?.message,
      });
      return false;
    }

    console.log("[Email] Brevo accepted email", { messageId: result?.messageId });
    return true;
  } catch (error) {
    console.error("[Email] Brevo API error:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Templates (exported builders so previews/tests can render without sending)
// ---------------------------------------------------------------------------

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
export function buildPicksUnlockedEmail(username: string, weekNumber: number, leagueNames: string[]): EmailContent {
  const singleLeague = leagueNames.length === 1 ? leagueNames[0] : null;
  const subject = singleLeague
    ? `🏈 ${singleLeague}: Week ${weekNumber} is open — pick your underdog`
    : `🏈 Week ${weekNumber} is open — pick your underdog`;
  const leagueLine = singleLeague
    ? `The Week ${weekNumber} spreads just posted in <strong>${singleLeague}</strong>.`
    : `The Week ${weekNumber} spreads just posted in your leagues: <strong>${leagueNames.join('</strong>, <strong>')}</strong>.`;
  const leagueLinePlain = singleLeague
    ? `The Week ${weekNumber} spreads just posted in ${singleLeague}.`
    : `The Week ${weekNumber} spreads just posted in your leagues: ${leagueNames.join(', ')}.`;

  return {
    subject,
    html: emailLayout({
      preheader: `${leagueLinePlain} Find the dog that wins outright.`,
      heading: 'Week Is Open',
      subheading: singleLeague ? `${singleLeague} · NFL Week ${weekNumber}` : `NFL Week ${weekNumber} spreads are posted`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 16px 0; color: #4b5563; line-height: 1.6;">${leagueLine} Sixteen games, one pick — find the dog that's going to win outright.</p>
        ${calloutBox('⏰ Picks lock Sunday at 1:00 PM ET', 'Or at kickoff if you take a Thursday or Saturday game.')}
        ${ctaButton('Pick Your Underdog')}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">Win outright and you earn the spread. Covering doesn't count.</p>`
    }),
    text: `${subject}

Hi ${username},

${leagueLinePlain} Sixteen games, one pick — find the dog that's going to win outright.

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

export async function sendPickReminderEmail(email: string, username: string, weekNumber: number, deadline: string): Promise<boolean> {
  return sendEmail({ to: email, ...buildPickReminderEmail(username, weekNumber, deadline) });
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
  weekNumber: number,
  leagueNames: string[]
): Promise<boolean> {
  return sendEmail({ to: email, ...buildPicksUnlockedEmail(username, weekNumber, leagueNames) });
}
