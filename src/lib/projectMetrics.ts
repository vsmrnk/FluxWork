import type { Supabase } from "@/lib/invoice";

/**
 * Project-scoped counterpart to `getOverviewMetrics` (which is account-wide).
 * Returns raw seconds only — the caller owns the effective rate
 * (project.rate ?? client.default_rate) and turns seconds into money, so the
 * two never drift apart. Weeks are Monday-based, computed in UTC to match
 * `lib/metrics.ts`.
 */

export type ProjectMetrics = {
  /** 7 buckets of tracked seconds, Mon → Sun of the current week. */
  weekSeconds: number[];
  weekBillableSeconds: number;
  weekTotalSeconds: number;
  todaySeconds: number;
  /** Billable seconds not yet pulled onto an invoice (all-time). */
  unbilledSeconds: number;
};

function startOfWeekUTC(d: Date): Date {
  const sinceMon = (d.getUTCDay() + 6) % 7; // getUTCDay: 0 = Sun
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMon),
  );
}

export async function getProjectMetrics(
  supabase: Supabase,
  projectId: string,
): Promise<ProjectMetrics> {
  const now = new Date();
  const startThis = startOfWeekUTC(now);
  const startToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const [{ data: week }, { data: unbilled }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("duration_seconds, started_at, is_billable, tasks!inner(project_id)")
      .eq("tasks.project_id", projectId)
      .gte("started_at", startThis.toISOString())
      .not("ended_at", "is", null),
    supabase
      .from("time_entries")
      .select("duration_seconds, tasks!inner(project_id)")
      .eq("tasks.project_id", projectId)
      .eq("is_billable", true)
      .is("invoice_id", null)
      .not("ended_at", "is", null),
  ]);

  const weekSeconds = [0, 0, 0, 0, 0, 0, 0];
  let weekBillableSeconds = 0;
  let weekTotalSeconds = 0;
  let todaySeconds = 0;

  for (const e of week ?? []) {
    const seconds = e.duration_seconds ?? 0;
    const started = new Date(e.started_at);
    const bucket = Math.floor(
      (started.getTime() - startThis.getTime()) / 86_400_000,
    );
    if (bucket >= 0) weekSeconds[Math.min(6, bucket)] += seconds;

    weekTotalSeconds += seconds;
    if (e.is_billable) weekBillableSeconds += seconds;
    if (started >= startToday) todaySeconds += seconds;
  }

  let unbilledSeconds = 0;
  for (const e of unbilled ?? []) unbilledSeconds += e.duration_seconds ?? 0;

  return {
    weekSeconds,
    weekBillableSeconds,
    weekTotalSeconds,
    todaySeconds,
    unbilledSeconds,
  };
}
