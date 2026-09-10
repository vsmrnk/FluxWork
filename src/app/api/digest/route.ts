import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderDigestEmail, type DigestData } from "@/lib/digestEmail";
import { sendViaResend } from "@/lib/authEmail";
import { round2 } from "@/lib/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type Window = { start: string; end: string; label: string };

function authorized(request: Request, cronSecret: string): boolean {
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${cronSecret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The last 7 full UTC days. */
function lastSevenDays(now = new Date()): Window {
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const start = new Date(startOfToday - 7 * 86400000);
  const lastDay = new Date(startOfToday - 86400000);
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return {
    start: start.toISOString(),
    end: new Date(startOfToday).toISOString(),
    label: `${fmt.format(start)} – ${fmt.format(lastDay)}`,
  };
}

/**
 * RLS BYPASS: the service-role client ignores row-level security, so every
 * query here MUST filter user_id explicitly. Do not swap in the RLS-scoped
 * helpers (metrics.ts, listUnbilledClients) — they would sum every user's rows.
 *
 * Returns null when the user tracked nothing in the window.
 */
async function computeForUser(
  admin: Admin,
  userId: string,
  win: Window,
): Promise<DigestData | null> {
  const { data: projects } = await admin
    .from("projects")
    .select("id, name, rate, clients(default_rate, currency)")
    .eq("user_id", userId);

  const rateByProject = new Map<string, number>();
  const nameByProject = new Map<string, string>();
  let currency = "USD";
  for (const p of projects ?? []) {
    rateByProject.set(p.id, p.rate ?? p.clients?.default_rate ?? 0);
    nameByProject.set(p.id, p.name);
    if (p.clients?.currency) currency = p.clients.currency;
  }

  const { data: entries } = await admin
    .from("time_entries")
    .select("duration_seconds, is_billable, tasks!inner(project_id)")
    .eq("user_id", userId)
    .gte("started_at", win.start)
    .lt("started_at", win.end)
    .not("ended_at", "is", null);

  let billableSeconds = 0;
  let nonBillableSeconds = 0;
  let earnings = 0;
  const secondsByProject = new Map<string, number>();
  for (const e of entries ?? []) {
    const projectId = e.tasks.project_id;
    const seconds = e.duration_seconds ?? 0;
    secondsByProject.set(projectId, (secondsByProject.get(projectId) ?? 0) + seconds);
    if (e.is_billable) {
      billableSeconds += seconds;
      earnings += (seconds / 3600) * (rateByProject.get(projectId) ?? 0);
    } else {
      nonBillableSeconds += seconds;
    }
  }

  if (billableSeconds + nonBillableSeconds === 0) return null;

  let topProject: DigestData["topProject"] = null;
  for (const [projectId, seconds] of secondsByProject) {
    if (!topProject || seconds > topProject.seconds) {
      topProject = { name: nameByProject.get(projectId) ?? "Untitled project", seconds };
    }
  }

  // All-time billable time not yet on an invoice.
  const { data: unbilled } = await admin
    .from("time_entries")
    .select("duration_seconds, tasks!inner(project_id)")
    .eq("user_id", userId)
    .eq("is_billable", true)
    .is("invoice_id", null)
    .not("ended_at", "is", null);

  let unbilledTotal = 0;
  for (const e of unbilled ?? []) {
    unbilledTotal +=
      ((e.duration_seconds ?? 0) / 3600) * (rateByProject.get(e.tasks.project_id) ?? 0);
  }

  return {
    periodLabel: win.label,
    currency,
    earnings: round2(earnings),
    trackedSeconds: billableSeconds + nonBillableSeconds,
    billableSeconds,
    nonBillableSeconds,
    unbilledTotal: round2(unbilledTotal),
    topProject,
    appUrl: (process.env.AUTH_EMAIL_SITE_URL || "https://fluxwork-gamma.vercel.app").replace(/\/$/, ""),
  };
}

/** Weekly digest, triggered by Vercel Cron (see vercel.json). */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const admin = createAdminClient();

  // Without the secret we can't authenticate, without the key we can't read.
  if (!cronSecret || !admin) {
    return new Response("digest not configured", { status: 503 });
  }

  if (!authorized(request, cronSecret)) {
    return new Response("unauthorized", { status: 401 });
  }

  const win = lastSevenDays();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  const perPage = 200;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      failed += 1;
      break;
    }
    const users = data?.users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      if (user.user_metadata?.digest_opt_out === true || !user.email) {
        skipped += 1;
        continue;
      }

      try {
        const digest = await computeForUser(admin, user.id, win);
        if (!digest) {
          skipped += 1;
          continue;
        }
        const { subject, html } = renderDigestEmail(digest);
        const result = await sendViaResend(user.email, subject, html);
        if (result.ok) {
          sent += 1;
        } else {
          // Resend's sandbox domain only delivers to the account owner until a
          // custom domain is verified, so failures here are expected until then.
          console.error(`[digest] send failed for ${user.id}: ${result.error}`);
          failed += 1;
        }
      } catch (e) {
        console.error(`[digest] error for ${user.id}:`, e);
        failed += 1;
      }
    }

    if (users.length < perPage) break;
  }

  return Response.json({ sent, skipped, failed });
}
