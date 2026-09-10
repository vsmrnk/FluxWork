import crypto from "node:crypto";
import { escapeHtml, renderEmailShell } from "@/lib/emailShell";

// Payload of the Supabase "Send Email" auth hook.
export type SendEmailHookPayload = {
  user: { id: string; email: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string; // signup | magiclink | recovery | invite | email_change
    site_url: string;
  };
};

// ── Standard Webhooks signature verification ────────────────────────────────
// Supabase signs hook deliveries per the Standard Webhooks spec: headers
// `webhook-id`, `webhook-timestamp`, `webhook-signature`; the secret is base64
// after a `v1,whsec_` prefix (Supabase's dashboard form); signature =
// base64(HMAC-SHA256(`${id}.${ts}.${body}`)).
const TOLERANCE_SECONDS = 5 * 60;

export function verifyHookSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !sigHeader) return false;

  // Reject stale deliveries to blunt replay.
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() / 1000 - tsNum) > TOLERANCE_SECONDS) return false;

  // Strip the `v1,` version tag and `whsec_` prefix Supabase prepends, leaving
  // the raw base64 signing key.
  const secretBytes = Buffer.from(
    secret.replace(/^v1,/, "").replace(/^whsec_/, ""),
    "base64",
  );
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  // Header is a space-delimited list of `v1,<base64sig>` versions.
  return sigHeader.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const given = Buffer.from(sig);
    return (
      given.length === expectedBuf.length &&
      crypto.timingSafeEqual(given, expectedBuf)
    );
  });
}

// ── Confirm link ────────────────────────────────────────────────────────────
/**
 * Build the activation link that redeems the token at our own /auth/confirm
 * route (which calls verifyOtp). Mirrors the query params that route reads.
 *
 * The base is our own app origin (`AUTH_EMAIL_SITE_URL`), NOT the hook's
 * `site_url`: the latter reflects Supabase's "Site URL" setting, which if left
 * as the project URL yields a link that hits the Supabase gateway ("No API key
 * found") instead of this app's /auth/confirm route.
 */
export function buildConfirmUrl(data: SendEmailHookPayload["email_data"]): string {
  const base = (process.env.AUTH_EMAIL_SITE_URL || data.site_url).replace(/\/$/, "");
  const params = new URLSearchParams({
    token_hash: data.token_hash,
    type: data.email_action_type,
  });
  if (data.redirect_to) params.set("next", data.redirect_to);
  return `${base}/auth/confirm?${params.toString()}`;
}

// ── Branded template ────────────────────────────────────────────────────────
type Copy = { subject: string; kicker: string; heading: string; intro: string; cta: string };
const COPY: Record<string, Copy> = {
  signup: {
    subject: "Confirm your FluxWork account",
    kicker: "Account",
    heading: "Confirm your account",
    intro: "Welcome to FluxWork. Confirm your email to start tracking billable time and turning it into invoices.",
    cta: "Confirm account",
  },
  magiclink: {
    subject: "Your FluxWork sign-in link",
    kicker: "Sign in",
    heading: "Your sign-in link",
    intro: "Use the button below to sign in to FluxWork. For your security, this link expires shortly.",
    cta: "Sign in",
  },
  recovery: {
    subject: "Reset your FluxWork password",
    kicker: "Password reset",
    heading: "Reset your password",
    intro: "We received a request to reset your FluxWork password. Choose a new one with the button below. If this wasn't you, you can safely ignore this email.",
    cta: "Reset password",
  },
  invite: {
    subject: "You've been invited to FluxWork",
    kicker: "Invitation",
    heading: "Accept your invitation",
    intro: "You've been invited to FluxWork. Confirm your email to set up your account and get started.",
    cta: "Accept invite",
  },
  email_change: {
    subject: "Confirm your new FluxWork email",
    kicker: "Email change",
    heading: "Confirm your new email",
    intro: "Confirm this address to finish updating the email on your FluxWork account.",
    cta: "Confirm email",
  },
};

export function renderAuthEmail(
  actionType: string,
  confirmUrl: string,
  token: string,
): { subject: string; html: string } {
  const c = COPY[actionType] ?? COPY.signup;
  const url = escapeHtml(confirmUrl);

  const codeBlock = token
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;"><tr>
        <td style="background:#eef1f1;border-radius:11px;padding:14px 16px;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7e8a8d;margin:0 0 4px;">One-time code</div>
          <div style="font-family:'Courier New',monospace;font-size:20px;letter-spacing:3px;font-weight:700;color:#0f1a1c;">${escapeHtml(token)}</div>
        </td></tr></table>`
    : "";

  const card = `<div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0e5c63;font-weight:700;">${escapeHtml(c.kicker)}</div>
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.15;margin:12px 0 10px;color:#0f1a1c;">${escapeHtml(c.heading)}</h1>
          <p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#566468;margin:0 0 26px;">${escapeHtml(c.intro)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="border-radius:11px;background:#0e5c63;">
              <a href="${url}" style="display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:11px;">${escapeHtml(c.cta)} &rarr;</a>
            </td>
          </tr></table>
          <div style="height:1px;background:#dce2e1;margin:28px 0 0;line-height:1px;font-size:0;">&nbsp;</div>
          <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#7e8a8d;margin:20px 0 4px;">Or paste this link into your browser:</p>
          <p style="font-family:'Courier New',monospace;font-size:12px;line-height:1.5;color:#0e5c63;word-break:break-all;margin:0;">${url}</p>
          ${codeBlock}`;

  const footer = `<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#7e8a8d;margin:0;">FluxWork &middot; time tracking &amp; invoicing for freelancers</p>
          <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#9aa4a6;margin:6px 0 0;">If you didn't request this email, you can safely ignore it.</p>`;

  const html = renderEmailShell({ preheader: escapeHtml(c.intro), card, footer });
  return { subject: c.subject, html };
}

// ── Delivery (Resend HTTP API, no SDK dependency) ───────────────────────────
export async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) return { ok: false, error: "email not configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `resend ${res.status}: ${detail.slice(0, 200)}` };
  }
  return { ok: true };
}
