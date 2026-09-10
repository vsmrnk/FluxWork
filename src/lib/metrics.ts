import { round2 } from "@/lib/invoice";
import type { Supabase } from "@/lib/supabase/server";
import { startOfWeekUTC } from "@/lib/time";

/** Account-wide earnings for this and last week (billable seconds × effective rate). */
export async function getOverviewMetrics(supabase: Supabase) {
  const { data: projects } = await supabase
    .from("projects")
    .select("id, rate, clients(default_rate, currency)");

  const rateByProject = new Map<string, number>();
  let currency = "USD";
  for (const p of projects ?? []) {
    rateByProject.set(p.id, p.rate ?? p.clients?.default_rate ?? 0);
    if (p.clients?.currency) currency = p.clients.currency;
  }

  const startThis = startOfWeekUTC(new Date());
  const startLast = new Date(startThis.getTime() - 7 * 86_400_000);

  const { data: recent } = await supabase
    .from("time_entries")
    .select("duration_seconds, started_at, is_billable, tasks!inner(project_id)")
    .gte("started_at", startLast.toISOString())
    .not("ended_at", "is", null);

  const thisWeek = { billableSeconds: 0, nonBillableSeconds: 0, earnings: 0 };
  let lastWeekEarnings = 0;
  const daily = [0, 0, 0, 0, 0, 0, 0]; // Mon → Sun of the current week

  for (const e of recent ?? []) {
    const seconds = e.duration_seconds ?? 0;
    const started = new Date(e.started_at);
    const rate = rateByProject.get(e.tasks.project_id) ?? 0;
    const money = e.is_billable ? (seconds / 3600) * rate : 0;

    if (started >= startThis) {
      if (e.is_billable) {
        thisWeek.billableSeconds += seconds;
        thisWeek.earnings += money;
      } else {
        thisWeek.nonBillableSeconds += seconds;
      }
      const bucket = Math.min(
        6,
        Math.floor((started.getTime() - startThis.getTime()) / 86_400_000),
      );
      if (bucket >= 0) daily[bucket] += money;
    } else {
      lastWeekEarnings += money;
    }
  }

  return {
    currency,
    thisWeek: { ...thisWeek, earnings: round2(thisWeek.earnings) },
    lastWeekEarnings: round2(lastWeekEarnings),
    deltaPct:
      lastWeekEarnings > 0
        ? ((thisWeek.earnings - lastWeekEarnings) / lastWeekEarnings) * 100
        : null,
    daily: daily.map(round2),
  };
}
