import type { Supabase } from "@/lib/supabase/server";
import { startOfWeekUTC } from "@/lib/time";

/**
 * Project-scoped tracked seconds for the current UTC week. Returns seconds only;
 * the caller applies the effective rate so money is computed in one place.
 */
export async function getProjectMetrics(supabase: Supabase, projectId: string) {
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

  const weekSeconds = [0, 0, 0, 0, 0, 0, 0]; // Mon → Sun
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
