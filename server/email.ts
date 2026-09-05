import { ReplitConnectors } from '@replit/connectors-sdk';
if (!process.env.BREVO_FROM_EMAIL) {
  console.warn("BREVO_FROM_EMAIL environment variable is not set. Emails will NOT be sent until it is configured with a Brevo-verified sender address.");
}

// ---------------------------------------------------------------------------
// Shared branding
// ---------------------------------------------------------------------------

const SITE_URL = 'https://upsetpool.com';
const LOGO_URL = `${SITE_URL}/email-logo.png`;

/** A league as referenced from an email: the name members read, plus the id the deep link needs. */
export interface EmailLeagueRef {
  id?: number | null;
  name: string;
}

/**
 * Deep link to the selection page — the "Make Picks" tab on the home screen.
 * Passing a league id drops the member straight into that league's board
 * instead of whichever league the app would have defaulted to.
 */
export function pickPageUrl(leagueId?: number | null): string {
  const params = new URLSearchParams({ tab: 'spreads' });
  if (leagueId !== undefined && leagueId !== null) {
    params.set('league', String(leagueId));
  }
  return `${SITE_URL}/?${params.toString()}`;
}

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
/**
 * Global dry-run switch. With EMAIL_DRY_RUN set, every send is logged and
 * reported as delivered but nothing reaches Brevo — the whole pipeline
 * (targeting, pick checks, dedupe, scheduling) runs for real against a
 * staging database without mailing the league.
 */
export function isDryRun(): boolean {
  const flag = (process.env.EMAIL_DRY_RUN || '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

/** Every dry-run send this process has seen, newest last. Read by the admin status endpoint. */
const dryRunOutbox: Array<{ to: string; subject: string; sentAt: string }> = [];
const DRY_RUN_OUTBOX_LIMIT = 500;

export function getDryRunOutbox() {
  return [...dryRunOutbox];
}

export function clearDryRunOutbox() {
  dryRunOutbox.length = 0;
}

/** Why a send failed, in the caller's hands rather than only in the server log. */
export interface SendResult {
  ok: boolean;
  /** HTTP status from Brevo, when the request got that far. */
  status?: number;
  /** Brevo's own error code, e.g. "unauthorized", "invalid_parameter". */
  code?: string;
  /** Human-readable reason, safe to show a super admin. */
  reason?: string;
  messageId?: string;
}

/**
 * Send an email through the Replit-managed Brevo connection.
 * Requires BREVO_FROM_EMAIL to identify a Brevo-verified sender.
 *
 * Returns the failure reason rather than swallowing it: a bare boolean meant
 * every failure — revoked connection, unverified sender, malformed payload —
 * looked identical to the admin UI, which is exactly what made delivery
 * problems so hard to pin down.
 */
export async function sendEmailDetailed(params: EmailParams): Promise<SendResult> {
  if (isDryRun()) {
    console.log(`[Email][DRY RUN] would send to ${params.to}: ${params.subject}`);
    dryRunOutbox.push({ to: params.to, subject: params.subject, sentAt: new Date().toISOString() });
    if (dryRunOutbox.length > DRY_RUN_OUTBOX_LIMIT) dryRunOutbox.shift();
    return { ok: true, reason: 'dry run — not delivered' };
  }

  if (!process.env.BREVO_FROM_EMAIL) {
    console.error("Cannot send email: BREVO_FROM_EMAIL is not set. Configure a Brevo-verified sender address.");
    return { ok: false, reason: 'BREVO_FROM_EMAIL is not set. Configure a Brevo-verified sender address.' };
  }

  try {
    // Create this client per request so connector credentials are always fresh.
    const connectors = new ReplitConnectors();
    const response = await connectors.proxy("brevo", "/smtp/email", {
      method: "POST",
      body: {
        sender: {
          name: "The Upset Pool",
          email: process.env.BREVO_FROM_EMAIL,
        },
        to: [{ email: params.to }],
        subject: params.subject,
        textContent: params.text || "View this email in HTML format for the full experience.",
        htmlContent: params.html || params.text || "",
      },
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
      return {
        ok: false,
        status: response.status,
        code: result?.code,
        reason: result?.message || `Brevo returned ${response.status} with no message`,
      };
    }

    console.log("[Email] Brevo accepted email", { messageId: result?.messageId });
    return { ok: true, status: response.status, messageId: result?.messageId };
  } catch (error: any) {
    // Thrown before Brevo answered — usually the managed connection is missing,
    // unauthorised, or the proxy could not be reached.
    console.error("[Email] Brevo connector error:", error);
    return { ok: false, reason: `Could not reach the Brevo connection: ${error?.message || error}` };
  }
}

/** Boolean wrapper; every existing caller keeps working unchanged. */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  return (await sendEmailDetailed(params)).ok;
}

// ---------------------------------------------------------------------------
// Templates (exported builders so previews/tests can render without sending)
// ---------------------------------------------------------------------------

/**
 * One-hour warning for members with no pick in yet. `lockTime` is the week's
 * real picksLockAt rendered in ET, so the copy never contradicts the schedule.
 */
export function buildWeeklyPickReminderEmail(
  username: string,
  weekNumber: number,
  missingLeagues: Array<{ leagueName: string; leagueId?: number | null }>,
  lockTime: string = '1:00 PM ET'
): EmailContent {
  const leaguesHtml = missingLeagues.map(l => {
    const href = pickPageUrl(l.leagueId);
    return `<div style="background-color: #fef2f2; padding: 10px 16px; margin: 6px 0; border-radius: 6px;"><a href="${href}" style="color: #991b1b; font-weight: 500; text-decoration: none;">${l.leagueName} &rsaquo;</a></div>`;
  }).join('');
  const leaguesPlain = missingLeagues.map(l => `- ${l.leagueName}: ${pickPageUrl(l.leagueId)}`).join('\n');
  const leagueCountNote = missingLeagues.length === 1
    ? 'You still need a pick in this league:'
    : `You still need picks in ${missingLeagues.length} leagues:`;
  // One league → send them straight to its board. Several → the app picks a
  // default and the per-league links above cover the rest.
  const ctaHref = pickPageUrl(missingLeagues.length === 1 ? missingLeagues[0].leagueId : undefined);

  return {
    subject: `⏳ 1 hour left — you have no Week ${weekNumber} pick`,
    html: emailLayout({
      preheader: `Picks lock at ${lockTime} and you're not in. One missed week ends your drawing run.`,
      heading: 'Picks Lock in 1 Hour',
      subheading: `NFL Week ${weekNumber}`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 16px 0; color: #4b5563; line-height: 1.6;">Picks lock at <strong style="color: #dc2626;">${lockTime}</strong>. Right now you're getting zero points this week — and one missed week ends your run at the pick-every-week drawing. For the whole season. ${leagueCountNote}</p>
        ${leaguesHtml}
        ${ctaButton('Pick Now', ctaHref)}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">Takes about 20 seconds. Any dog will do.</p>`
    }),
    text: `1 hour left — you have no Week ${weekNumber} pick

Hi ${username},

Picks lock at ${lockTime}. Right now you're getting zero points this week — and one missed week ends your run at the pick-every-week drawing. For the whole season. ${leagueCountNote}
${leaguesPlain}

Pick now: ${ctaHref}

Takes about 20 seconds. Any dog will do.${TEXT_FOOTER}`
  };
}

/**
 * Notification that spreads are posted and the week is open to picks.
 * `lockDeadline` is the week's real picksLockAt rendered in ET.
 */
export function buildPicksUnlockedEmail(
  username: string,
  weekNumber: number,
  memberLeagues: EmailLeagueRef[],
  lockDeadline: string = 'Sunday at 1:00 PM ET'
): EmailContent {
  const singleLeague = memberLeagues.length === 1 ? memberLeagues[0] : null;
  const leagueNames = memberLeagues.map(l => l.name);
  const subject = singleLeague
    ? `🏈 ${singleLeague.name}: Week ${weekNumber} is open — pick your underdog`
    : `🏈 Week ${weekNumber} is open — pick your underdog`;
  const leagueLine = singleLeague
    ? `The Week ${weekNumber} spreads just posted in <strong>${singleLeague.name}</strong>.`
    : `The Week ${weekNumber} spreads just posted in your leagues: <strong>${leagueNames.join('</strong>, <strong>')}</strong>.`;
  const leagueLinePlain = singleLeague
    ? `The Week ${weekNumber} spreads just posted in ${singleLeague.name}.`
    : `The Week ${weekNumber} spreads just posted in your leagues: ${leagueNames.join(', ')}.`;
  const ctaHref = pickPageUrl(singleLeague?.id);

  return {
    subject,
    html: emailLayout({
      preheader: `${leagueLinePlain} Find the dog that wins outright.`,
      heading: 'Week Is Open',
      subheading: singleLeague ? `${singleLeague.name} · NFL Week ${weekNumber}` : `NFL Week ${weekNumber} spreads are posted`,
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 16px 0; color: #4b5563; line-height: 1.6;">${leagueLine} Sixteen games, one pick — find the dog that's going to win outright.</p>
        ${calloutBox(`⏰ Picks lock ${lockDeadline}`, 'Or at kickoff if you take a Thursday or Saturday game.')}
        ${ctaButton('Pick Your Underdog', ctaHref)}
        <p style="margin: 0; font-size: 13px; color: #6b7280; text-align: center;">Win outright and you earn the spread. Covering doesn't count.</p>`
    }),
    text: `${subject}

Hi ${username},

${leagueLinePlain} Sixteen games, one pick — find the dog that's going to win outright.

Picks lock ${lockDeadline}, or at kickoff if you take a Thursday or Saturday game.

Pick your underdog: ${ctaHref}

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

/**
 * Preflight connectivity test. Goes to exactly one person — the super admin who
 * pressed the button — and says so in the body, so if it ever escapes to a
 * member it is obvious what it is.
 */
export function buildPreflightTestEmail(username: string, sentAt: Date = new Date()): EmailContent {
  const stamp = sentAt.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return {
    subject: `[TEST] Upset Pool email delivery check — ${stamp} ET`,
    html: emailLayout({
      preheader: 'Preflight test. If you can read this, Brevo delivery is working.',
      heading: 'Email Delivery Test',
      subheading: 'Preflight check',
      bodyHtml: `
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #1f2937;">Hi ${username},</p>
        <p style="margin: 0 0 12px 0; color: #4b5563; line-height: 1.6;">This is a test message sent from the Site Admin preflight check. If it reached your inbox, Brevo is configured correctly and the league's scheduled emails can go out.</p>
        ${calloutBox('Sent to you only', 'No league member received this message. The preflight check has no recipient list — it can only mail the signed-in super admin.')}
        <p style="margin: 0; font-size: 13px; color: #6b7280;">Requested at ${stamp} ET.</p>`
    }),
    text: `[TEST] Upset Pool email delivery check

Hi ${username},

This is a test message sent from the Site Admin preflight check. If it reached your inbox, Brevo is configured correctly and the league's scheduled emails can go out.

No league member received this message. The preflight check has no recipient list — it can only mail the signed-in super admin.

Requested at ${stamp} ET.${TEXT_FOOTER}`
  };
}

// ---------------------------------------------------------------------------
// Sample renders — one place both the preview endpoint and the "mail me one of
// each" endpoint draw from, so a proof in the browser matches the proof in the
// inbox.
// ---------------------------------------------------------------------------

export const EMAIL_TEMPLATE_SAMPLES: Record<string, (name: string) => EmailContent> = {
  'picks-live': name =>
    buildPicksUnlockedEmail(name, 2, [{ id: 1, name: 'NFL Upset Pool' }], 'Sunday, September 20 at 1:00 PM ET'),
  'picks-live-multi': name =>
    buildPicksUnlockedEmail(
      name,
      2,
      [{ id: 1, name: 'NFL Upset Pool' }, { id: 2, name: 'Office Pool' }],
      'Sunday, September 20 at 1:00 PM ET'
    ),
  'one-hour-warning': name =>
    buildWeeklyPickReminderEmail(name, 2, [{ leagueName: 'NFL Upset Pool', leagueId: 1 }], '1:00 PM ET'),
  'one-hour-warning-multi': name =>
    buildWeeklyPickReminderEmail(
      name,
      2,
      [{ leagueName: 'NFL Upset Pool', leagueId: 1 }, { leagueName: 'Office Pool', leagueId: 2 }],
      '1:00 PM ET'
    ),
  'league-archived': name => buildLeagueArchivedEmail(name, 'NFL Upset Pool'),
  'preflight-test': name => buildPreflightTestEmail(name),
};

export const EMAIL_TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATE_SAMPLES);

// ---------------------------------------------------------------------------
// Send functions (signatures unchanged for existing callers)
// ---------------------------------------------------------------------------

/**
 * Send the preflight test to exactly one address. No fan-out, no recipient list.
 * Returns the detailed result on purpose: this send exists to explain itself,
 * so a boolean here would throw away the only thing it is for.
 */
export async function sendPreflightTestEmail(email: string, username: string): Promise<SendResult> {
  return sendEmailDetailed({ to: email, ...buildPreflightTestEmail(username) });
}

export async function sendLeagueArchivedEmail(email: string, username: string, leagueName: string): Promise<boolean> {
  return sendEmail({ to: email, ...buildLeagueArchivedEmail(username, leagueName) });
}

export async function sendWeeklyPickReminderEmail(
  email: string,
  username: string,
  weekNumber: number,
  missingLeagues: Array<{ leagueName: string; leagueId?: number | null }>,
  lockTime?: string
): Promise<SendResult> {
  return sendEmailDetailed({ to: email, ...buildWeeklyPickReminderEmail(username, weekNumber, missingLeagues, lockTime) });
}

export async function sendPicksUnlockedEmail(
  email: string,
  username: string,
  weekNumber: number,
  memberLeagues: EmailLeagueRef[],
  lockDeadline?: string
): Promise<SendResult> {
  return sendEmailDetailed({ to: email, ...buildPicksUnlockedEmail(username, weekNumber, memberLeagues, lockDeadline) });
}
