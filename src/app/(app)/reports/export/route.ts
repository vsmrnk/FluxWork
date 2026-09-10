import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/invoice";
import { getPlan } from "@/lib/plan";
import { resolveRange } from "@/lib/reports";
import { formatHours } from "@/lib/time";

// Per-user file built from the session — never cache it.
export const dynamic = "force-dynamic";

/** RFC-4180 field escaping. */
function cell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of a range's completed entries. Pro-only, enforced here, not just in the UI. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const plan = await getPlan(supabase);
  if (!plan.canExport) {
    return new Response("Exporting is a paid feature. Upgrade to export your data.", {
      status: 403,
    });
  }

  const range = resolveRange(new URL(request.url).searchParams.get("range"));

  const { data: entries, error } = await supabase
    .from("time_entries")
    .select(
      "started_at, ended_at, duration_seconds, is_billable, tasks!inner(name, projects!inner(name, rate, clients(name, default_rate, currency)))",
    )
    .gte("started_at", range.start.toISOString())
    .lt("started_at", range.end.toISOString())
    .not("ended_at", "is", null)
    .order("started_at", { ascending: true });

  if (error) return new Response("Could not build export", { status: 500 });

  const lines = ["date,start,end,duration_h,task,project,client,billable,rate,amount"];
  for (const e of entries ?? []) {
    const project = e.tasks.projects;
    const rate = project.rate ?? project.clients?.default_rate ?? 0;
    const seconds = e.duration_seconds ?? 0;
    const amount = e.is_billable ? round2((seconds / 3600) * rate) : 0;
    const started = new Date(e.started_at).toISOString();

    lines.push(
      [
        started.slice(0, 10), // UTC date
        started.slice(11, 16), // UTC HH:MM
        e.ended_at ? new Date(e.ended_at).toISOString().slice(11, 16) : "",
        formatHours(seconds),
        cell(e.tasks.name),
        cell(project.name),
        cell(project.clients?.name ?? ""),
        e.is_billable ? "yes" : "no",
        rate.toFixed(2),
        amount.toFixed(2),
      ].join(","),
    );
  }

  return new Response(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fluxwork-report-${range.key}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
