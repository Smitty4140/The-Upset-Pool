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

// Pulled from the app's own tokens so email and product read as one thing.
const NAVY = '#0f2a47';
const BRAND = '#0056b3';   // --primary
const INK = '#111827';
const BODY = '#4b5563';
const MUTED = '#6b7280';
const HAIRLINE = '#e5e7eb';

/** Escape user-supplied text (usernames, league names) before interpolating. */
function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

/**
 * One row per league, each linking straight to that league's pick board. This
 * is the call to action for a multi-league member: a single generic button
 * can't say which league it means, and these can.
 */
function leagueList(leagues: EmailLeagueRef[], action: string): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 18px 0 4px 0; border-top: 1px solid ${HAIRLINE};">
        ${leagues.map(l => `<tr>
          <td style="padding: 12px 0; border-bottom: 1px solid ${HAIRLINE};">
            <a href="${pickPageUrl(l.id)}" style="color: ${INK}; font-size: 15px; font-weight: 600; text-decoration: none;">${esc(l.name)}</a>
          </td>
          <td align="right" style="padding: 12px 0; border-bottom: 1px solid ${HAIRLINE}; white-space: nowrap;">
            <a href="${pickPageUrl(l.id)}" style="color: ${BRAND}; font-size: 14px; font-weight: 600; text-decoration: none;">${action} &rarr;</a>
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
 * Shared layout: slim branded bar, white card, plain-text footer. Deliberately
 * restrained — the message should read before any of the design does.
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
 * Send an email through Brevo's transactional REST API.
 * Requires a protected API key and a Brevo-verified sender address.
 *
 * Returns the failure reason rather than swallowing it: a bare boolean meant
 * every failure — bad key, unauthorised IP, unverified sender, malformed
 * payload — looked identical to the admin UI, which is exactly what made
 * delivery problems so hard to pin down.
 */
export async function sendEmailDetailed(params: EmailParams): Promise<SendResult> {
  if (isDryRun()) {
    console.log(`[Email][DRY RUN] would send to ${params.to}: ${params.subject}`);
    dryRunOutbox.push({ to: params.to, subject: params.subject, sentAt: new Date().toISOString() });
    if (dryRunOutbox.length > DRY_RUN_OUTBOX_LIMIT) dryRunOutbox.shift();
    return { ok: true, reason: 'dry run — not delivered' };
  }

  if (!process.env.BREVO_API_KEY) {
    console.error("Cannot send email: BREVO_API_KEY is not set.");
    return { ok: false, reason: 'BREVO_API_KEY is not set.' };
  }
  if (!process.env.BREVO_FROM_EMAIL) {
    console.error("Cannot send email: BREVO_FROM_EMAIL is not set. Configure a Brevo-verified sender address.");
    return { ok: false, reason: 'BREVO_FROM_EMAIL is not set. Configure a Brevo-verified sender address.' };
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
    // Thrown before Brevo answered at all — DNS, TLS, or outbound egress.
    console.error("[Email] Brevo API error:", error);
    return { ok: false, reason: `Could not reach the Brevo API: ${error?.message || error}` };
  }
}

/** Boolean wrapper; every existing caller keeps working unchanged. */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  return (await sendEmailDetailed(params)).ok;
}

// ---------------------------------------------------------------------------
// Templates (exported builders so previews/tests can render without sending)
// ---------------------------------------------------------------------------

/** Button label for a single-league CTA; long names go generic. */
function openLeagueLabel(league: EmailLeagueRef, verb: string): string {
  return league.name.length <= 22 ? `${verb} in ${league.name}` : `${verb} in your league`;
}

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
  const leagues: EmailLeagueRef[] = missingLeagues.map(l => ({ id: l.leagueId, name: l.leagueName }));
  const single = leagues.length === 1 ? leagues[0] : null;
  const subject = single
    ? `Week ${weekNumber} picks lock in 1 hour — no pick yet in ${single.name}`
    : `Week ${weekNumber} picks lock in 1 hour — no pick yet in ${leagues.length} leagues`;

  const leadHtml = single
    ? `Week ${weekNumber} picks lock at <strong style="color: ${INK};">${esc(lockTime)}</strong>, about an hour from now. You don't have a pick in yet for <strong style="color: ${INK};">${esc(single.name)}</strong>.`
    : `Week ${weekNumber} picks lock at <strong style="color: ${INK};">${esc(lockTime)}</strong>, about an hour from now. You don't have a pick in yet for these leagues:`;
  const leadText = single
    ? `Week ${weekNumber} picks lock at ${lockTime}, about an hour from now. You don't have a pick in yet for ${single.name}.`
    : `Week ${weekNumber} picks lock at ${lockTime}, about an hour from now. You don't have a pick in yet for these leagues:`;

  return {
    subject,
    html: emailLayout({
      preheader: leadText,
      eyebrow: `NFL Week ${weekNumber}`,
      heading: 'Picks lock in 1 hour',
      bodyHtml: `
        <p style="margin: 0 0 12px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">Hi ${esc(username)},</p>
        <p style="margin: 0 0 4px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">${leadHtml}</p>
        ${single ? ctaButton(openLeagueLabel(single, 'Make your pick'), pickPageUrl(single.id)) : leagueList(leagues, 'Make your pick')}
        <p style="margin: 18px 0 0 0; color: ${MUTED}; font-size: 13px; line-height: 1.6;">A missed week scores zero and ends your streak for the pick-every-week drawing.</p>`
    }),
    text: `${subject}

Hi ${username},

${leadText}
${single
  ? `\nMake your pick: ${pickPageUrl(single.id)}`
  : '\n' + leagues.map(l => `- ${l.name}: ${pickPageUrl(l.id)}`).join('\n')}

A missed week scores zero and ends your streak for the pick-every-week drawing.${TEXT_FOOTER}`
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
  const single = memberLeagues.length === 1 ? memberLeagues[0] : null;
  const subject = single
    ? `Week ${weekNumber} picks are open in ${single.name}`
    : `Week ${weekNumber} picks are open in ${memberLeagues.length} of your leagues`;

  const leadHtml = single
    ? `The Week ${weekNumber} spreads are posted in <strong style="color: ${INK};">${esc(single.name)}</strong>, so picks are now open.`
    : `The Week ${weekNumber} spreads are posted, so picks are now open in these leagues:`;
  const leadText = single
    ? `The Week ${weekNumber} spreads are posted in ${single.name}, so picks are now open.`
    : `The Week ${weekNumber} spreads are posted, so picks are now open in these leagues:`;

  return {
    subject,
    html: emailLayout({
      preheader: `${leadText} Picks lock ${lockDeadline}.`,
      eyebrow: `NFL Week ${weekNumber}`,
      heading: 'Picks are open',
      bodyHtml: `
        <p style="margin: 0 0 12px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">Hi ${esc(username)},</p>
        <p style="margin: 0 0 4px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">${leadHtml}</p>
        ${single ? ctaButton(openLeagueLabel(single, 'Make your pick'), pickPageUrl(single.id)) : leagueList(memberLeagues, 'Make your pick')}
        ${detailRow('Picks lock', `${esc(lockDeadline)} — or at kickoff for a Thursday or Saturday game`)}`
    }),
    text: `${subject}

Hi ${username},

${leadText}
${single
  ? `\nMake your pick: ${pickPageUrl(single.id)}`
  : '\n' + memberLeagues.map(l => `- ${l.name}: ${pickPageUrl(l.id)}`).join('\n')}

Picks lock ${lockDeadline} — or at kickoff for a Thursday or Saturday game.${TEXT_FOOTER}`
  };
}

/** Notice sent to league members when an admin archives the league. */
export function buildLeagueArchivedEmail(username: string, leagueName: string): EmailContent {
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
        ${ctaButton('View past seasons')}
        <p style="margin: 18px 0 0 0; color: ${MUTED}; font-size: 13px; line-height: 1.6;">If an admin restores the league, it moves back to your active list automatically.</p>`
    }),
    text: `${subject}

Hi ${username},

Your league admin archived ${leagueName}. It now shows under "Past Seasons" on your home screen instead of your active leagues. All results and standings are still there — nothing was deleted.

View past seasons: ${SITE_URL}

If an admin restores the league, it moves back to your active list automatically.${TEXT_FOOTER}`
  };
}

/** Preflight delivery check, sent only to the signed-in super admin. */
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
      eyebrow: 'Preflight check',
      heading: 'Email Delivery Test',
      bodyHtml: `
        <p style="margin: 0 0 12px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">Hi ${esc(username)},</p>
        <p style="margin: 0 0 4px 0; color: ${BODY}; font-size: 15px; line-height: 1.6;">This is a test message sent from the Site Admin preflight check. If it reached your inbox, Brevo is configured correctly and the league's scheduled emails can go out.</p>
        ${detailRow('Sent to you only', 'No league member received this message. The preflight check has no recipient list — it can only mail the signed-in super admin.')}
        <p style="margin: 18px 0 0 0; color: ${MUTED}; font-size: 13px; line-height: 1.6;">Requested at ${stamp} ET.</p>`
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
