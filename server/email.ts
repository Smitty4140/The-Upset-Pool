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

// Palette pulled from the app's own tokens so email and product match.
const NAVY = '#0f2a47';
const BRAND = '#0056b3';   // --primary
const INK = '#111827';
const BODY = '#4b5563';
const MUTED = '#6b7280';
const HAIRLINE = '#e5e7eb';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** A league as referenced from an email: enough to name it and link to it. */
export interface EmailLeague {
  id: number;
  name: string;
}

interface EmailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/** Escape user-supplied text (usernames, league names) before interpolating. */
function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Deep link to a specific league's page; falls back to the home screen. */
export function leagueUrl(leagueId?: number): string {
  return leagueId ? `${SITE_URL}/?league=${leagueId}` : SITE_URL;
}

/** Single primary call-to-action. Solid fill, no gradient, no glow. */
function ctaButton(label: string, href: string = SITE_URL): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0 4px 0;">
        <tr>
          <td style="border-radius: 6px; background-color: ${BRAND};">
            <a href="${href}" style="display: inline-block; padding: 12px 22px; color: #ffffff; font-size: 15px; font-weight: 600; line-height: 20px; text-decoration: none;">${label}</a>
          </td>
        </tr>
      </table>`;
}

/** One row per league, each linking straight to that league's page. */
function leagueList(leagues: EmailLeague[], action: string): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 18px 0 4px 0; border-top: 1px solid ${HAIRLINE};">
        ${leagues.map(l => `<tr>
          <td style="padding: 12px 0; border-bottom: 1px solid ${HAIRLINE};">
            <a href="${leagueUrl(l.id)}" style="color: ${INK}; font-size: 15px; font-weight: 600; text-decoration: none;">${esc(l.name)}</a>
          </td>
          <td align="right" style="padding: 12px 0; border-bottom: 1px solid ${HAIRLINE}; white-space: nowrap;">
            <a href="${leagueUrl(l.id)}" style="color: ${BRAND}; font-size: 14px; font-weight: 600; text-decoration: none;">${action} &rarr;</a>
          </td>
        </tr>`).join('')}
      </table>`;
}

/** Quiet label/value row for facts like the lock time. */
function detailRow(label: string, value: string): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 18px 0 0 0;">
        <tr>
          <td style="padding: 10px 12px; background-color: #f9fafb; border-left: 3px solid ${HAIRLINE}; border-radius: 0 4px 4px 0;">
            <span style="color: ${MUTED}; font-size: 13px;">${label}</span><br />
            <span style="color: ${INK}; font-size: 14px; font-weight: 600;">${value}</span>
          </td>
        </tr>
      </table>`;
}

/**
 * Shared layout: slim branded bar, white card, plain text footer. Nothing
 * oversized — the message should read before any of the design does.
 */
function emailLayout(opts: { preheader?: string; eyebrow: string; heading: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  ${opts.preheader ? `<div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${opts.preheader}</div>` : ''}
  <div style="max-width: 560px; margin: 0 auto; padding: 24px 12px;">

    <div style="background-color: #ffffff; border: 1px solid ${HAIRLINE}; border-radius: 10px; overflow: hidden;">

      <!-- Brand bar -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${NAVY};">
        <tr>
          <td style="padding: 14px 24px;">
            <img src="${LOGO_URL}" alt="" width="24" height="24" style="width: 24px; height: 24px; vertical-align: middle;" />
            <span style="color: #ffffff; font-size: 14px; font-weight: 600; letter-spacing: 0.2px; vertical-align: middle; padding-left: 8px;">The Upset Pool</span>
          </td>
        </tr>
      </table>

      <!-- Content -->
      <div style="padding: 24px;">
        <p style="margin: 0 0 6px 0; color: ${MUTED}; font-size: 12px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase;">${opts.eyebrow}</p>
        <h1 style="margin: 0 0 14px 0; color: ${INK}; font-size: 20px; font-weight: 700; line-height: 1.3;">${opts.heading}</h1>
        ${opts.bodyHtml}
      </div>

    </div>

    <!-- Footer -->
    <div style="padding: 16px 8px 0 8px; text-align: center;">
      <p style="margin: 0 0 4px 0; color: ${MUTED}; font-size: 12px;">
        The Upset Pool &middot; <a href="${SITE_URL}" style="color: ${MUTED}; text-decoration: underline;">upsetpool.com</a>
      </p>
      <p style="margin: 0; color: #9ca3af; font-size: 11px;">
        Manage email notifications in your <a href="${SITE_URL}/profile" style="color: #9ca3af; text-decoration: underline;">profile settings</a>.
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

const LOCK_TIME = 'Sunday, 1:00 PM ET';

/** "Sunday Night Crew" / "Sunday Night Crew and 2 others" for subject lines. */
function subjectLeagues(leagues: EmailLeague[]): string {
  if (leagues.length === 0) return 'your league';
  if (leagues.length === 1) return leagues[0].name;
  if (leagues.length === 2) return `${leagues[0].name} and ${leagues[1].name}`;
  return `${leagues[0].name} and ${leagues.length - 1} others`;
}

/** Button label for a single-league CTA; long names go generic. */
function openLeagueLabel(league: EmailLeague, verb: string): string {
  return league.name.length <= 22 ? `${verb} in ${league.name}` : `${verb} in your league`;
}

/**
 * Week is open: spreads posted, picks now available. Sent automatically once
 * the week's lines land.
 */
export function buildPicksUnlockedEmail(username: string, weekNumber: number, leagues: EmailLeague[]): EmailContent {
  const single = leagues.length === 1 ? leagues[0] : null;
  const subject = single
    ? `Week ${weekNumber} picks are open in ${single.name}`
    : `Week ${weekNumber} picks are open in ${leagues.length} of your leagues`;

  const leadHtml = single
    ? `The Week ${weekNumber} spreads are posted in <strong style="color: ${INK};">${esc(single.name)}</strong>, so picks are now open.`
    : `The Week ${weekNumber} spreads are posted, so picks are now open in these leagues:`;
  const leadText = single
    ? `The Week ${weekNumber} spreads are posted in ${single.name}, so picks are now open.`
    : `The Week ${weekNumber} spreads are posted, so picks are now open in these leagues:`;

  const bodyMiddle = single
    ? ctaButton(openLeagueLabel(single, 'Make your pick'), leagueUrl(single.id))
    : leagueList(leagues, 'Make your pick');

  return {
    subject,
    html: emailLayout({
      preheader: `${leadText} Picks lock ${LOCK_TIME.toLowerCase()}.`,
      eyebrow: `NFL Week ${weekNumber}`,
      heading: 'Picks are open',
      bodyHtml: `
        <p style="margin: 0 0 12px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">Hi ${esc(username)},</p>
        <p style="margin: 0 0 4px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">${leadHtml}</p>
        ${bodyMiddle}
        ${detailRow('Picks lock', `${LOCK_TIME} — or at kickoff for a Thursday or Saturday game`)}`
    }),
    text: `${subject}

Hi ${username},

${leadText}
${single ? `\nMake your pick: ${leagueUrl(single.id)}` : '\n' + leagues.map(l => `- ${l.name}: ${leagueUrl(l.id)}`).join('\n')}

Picks lock ${LOCK_TIME} — or at kickoff for a Thursday or Saturday game.${TEXT_FOOTER}`
  };
}

/**
 * Sunday-noon reminder: picks lock in an hour and this user still has none in
 * one or more leagues.
 */
export function buildWeeklyPickReminderEmail(
  username: string,
  weekNumber: number,
  missingLeagues: EmailLeague[]
): EmailContent {
  const single = missingLeagues.length === 1 ? missingLeagues[0] : null;
  const subject = single
    ? `Week ${weekNumber} picks lock in 1 hour — no pick yet in ${single.name}`
    : `Week ${weekNumber} picks lock in 1 hour — no pick yet in ${missingLeagues.length} leagues`;

  const leadHtml = single
    ? `Week ${weekNumber} picks lock at <strong style="color: ${INK};">1:00 PM ET</strong>, about an hour from now. You don't have a pick in yet for <strong style="color: ${INK};">${esc(single.name)}</strong>.`
    : `Week ${weekNumber} picks lock at <strong style="color: ${INK};">1:00 PM ET</strong>, about an hour from now. You don't have a pick in yet for these leagues:`;
  const leadText = single
    ? `Week ${weekNumber} picks lock at 1:00 PM ET, about an hour from now. You don't have a pick in yet for ${single.name}.`
    : `Week ${weekNumber} picks lock at 1:00 PM ET, about an hour from now. You don't have a pick in yet for these leagues:`;

  const bodyMiddle = single
    ? ctaButton(openLeagueLabel(single, 'Make your pick'), leagueUrl(single.id))
    : leagueList(missingLeagues, 'Make your pick');

  return {
    subject,
    html: emailLayout({
      preheader: leadText,
      eyebrow: `NFL Week ${weekNumber}`,
      heading: 'Picks lock in 1 hour',
      bodyHtml: `
        <p style="margin: 0 0 12px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">Hi ${esc(username)},</p>
        <p style="margin: 0 0 4px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">${leadHtml}</p>
        ${bodyMiddle}
        <p style="margin: 18px 0 0 0; color: ${MUTED}; font-size: 13px; line-height: 1.6;">A missed week scores zero and ends your streak for the pick-every-week drawing.</p>`
    }),
    text: `${subject}

Hi ${username},

${leadText}
${single ? `\nMake your pick: ${leagueUrl(single.id)}` : '\n' + missingLeagues.map(l => `- ${l.name}: ${leagueUrl(l.id)}`).join('\n')}

A missed week scores zero and ends your streak for the pick-every-week drawing.${TEXT_FOOTER}`
  };
}

/** Reminder for users who haven't picked yet this week (manual admin trigger). */
export function buildPickReminderEmail(username: string, weekNumber: number, deadline: string): EmailContent {
  const subject = `No Week ${weekNumber} pick yet — picks lock ${LOCK_TIME}`;
  return {
    subject,
    html: emailLayout({
      preheader: `You don't have a Week ${weekNumber} pick in yet.`,
      eyebrow: `NFL Week ${weekNumber}`,
      heading: 'No pick in yet',
      bodyHtml: `
        <p style="margin: 0 0 12px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">Hi ${esc(username)},</p>
        <p style="margin: 0 0 4px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">You don't have a Week ${weekNumber} pick in yet. Every game is still on the board.</p>
        ${ctaButton('Make your pick')}
        ${detailRow('Picks lock', esc(deadline))}`
    }),
    text: `${subject}

Hi ${username},

You don't have a Week ${weekNumber} pick in yet. Every game is still on the board.

Picks lock: ${deadline}

Make your pick: ${SITE_URL}${TEXT_FOOTER}`
  };
}

/** Notice sent to league members when an admin archives the league. */
export function buildLeagueArchivedEmail(username: string, leagueName: string, leagueId?: number): EmailContent {
  const subject = `${leagueName} moved to Past Seasons`;
  return {
    subject,
    html: emailLayout({
      preheader: `${leagueName} has moved to Past Seasons. Nothing was deleted.`,
      eyebrow: esc(leagueName),
      heading: 'League moved to Past Seasons',
      bodyHtml: `
        <p style="margin: 0 0 12px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">Hi ${esc(username)},</p>
        <p style="margin: 0 0 4px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">Your league admin archived <strong style="color: ${INK};">${esc(leagueName)}</strong>. It now shows under "Past Seasons" on your home screen instead of your active leagues. All results and standings are still there — nothing was deleted.</p>
        ${ctaButton('View past seasons', leagueUrl(leagueId))}
        <p style="margin: 18px 0 0 0; color: ${MUTED}; font-size: 13px; line-height: 1.6;">If an admin restores the league, it moves back to your active list automatically.</p>`
    }),
    text: `${subject}

Hi ${username},

Your league admin archived ${leagueName}. It now shows under "Past Seasons" on your home screen instead of your active leagues. All results and standings are still there — nothing was deleted.

View past seasons: ${leagueUrl(leagueId)}

If an admin restores the league, it moves back to your active list automatically.${TEXT_FOOTER}`
  };
}

// ---------------------------------------------------------------------------
// Send functions
// ---------------------------------------------------------------------------

export async function sendLeagueArchivedEmail(email: string, username: string, leagueName: string, leagueId?: number): Promise<boolean> {
  return sendEmail({ to: email, ...buildLeagueArchivedEmail(username, leagueName, leagueId) });
}

export async function sendPickReminderEmail(email: string, username: string, weekNumber: number, deadline: string): Promise<boolean> {
  return sendEmail({ to: email, ...buildPickReminderEmail(username, weekNumber, deadline) });
}

export async function sendWeeklyPickReminderEmail(
  email: string,
  username: string,
  weekNumber: number,
  missingLeagues: EmailLeague[]
): Promise<boolean> {
  return sendEmail({ to: email, ...buildWeeklyPickReminderEmail(username, weekNumber, missingLeagues) });
}

export async function sendPicksUnlockedEmail(
  email: string,
  username: string,
  weekNumber: number,
  leagues: EmailLeague[]
): Promise<boolean> {
  return sendEmail({ to: email, ...buildPicksUnlockedEmail(username, weekNumber, leagues) });
}
