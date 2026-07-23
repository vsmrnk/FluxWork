import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/ProjectForm";
import { FirstRunCard } from "@/components/FirstRunCard";
import { Sparkline } from "@/components/Sparkline";
import { formatHours, formatClock, elapsedSeconds } from "@/lib/time";
import { formatMoney } from "@/lib/invoice";
import { getOverviewMetrics } from "@/lib/metrics";
import { getPlanUsage } from "@/lib/plan";
import { getUnbilledByClient } from "@/lib/unbilled";
import type { Supabase } from "@/lib/invoice";
import type { Project, ProjectRollup } from "@/lib/database.types";

type TodayStrip = {
  trackedSeconds: number;
  running: { taskName: string; projectName: string } | null;
};

/** Time tracked today (completed + running-so-far) and what's running now. */
async function getTodayStrip(supabase: Supabase): Promise<TodayStrip> {
  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();

  const [{ data: done }, { data: runningEntry }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("duration_seconds")
      .gte("started_at", startOfToday)
      .not("ended_at", "is", null),
    supabase
      .from("time_entries")
      .select("started_at, tasks!inner(name, projects!inner(name))")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let trackedSeconds = (done ?? []).reduce(
    (sum, e) => sum + (e.duration_seconds ?? 0),
    0,
  );

  let running: TodayStrip["running"] = null;
  if (runningEntry) {
    const task = (
      Array.isArray(runningEntry.tasks) ? runningEntry.tasks[0] : runningEntry.tasks
    ) as { name: string; projects: unknown } | undefined;
    const project = (
      Array.isArray(task?.projects) ? task?.projects[0] : task?.projects
    ) as { name: string } | undefined;
    running = {
      taskName: task?.name ?? "Untitled task",
      projectName: project?.name ?? "",
    };
    trackedSeconds += elapsedSeconds(runningEntry.started_at);
  }

  return { trackedSeconds, running };
}

export default async function TodayPage() {
  const supabase = await createClient();

  const [{ data: projects }, { data: rollups }, { data: clients }, metrics, unbilled, today, usage] =
    await Promise.all([
      supabase
        .from("projects")
        .select("*")
        .order("is_archived", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase.from("project_rollups").select("*"),
      supabase
        .from("clients")
        .select("id, name, default_rate")
        .eq("is_archived", false)
        .order("name", { ascending: true }),
      getOverviewMetrics(supabase),
      getUnbilledByClient(supabase),
      getTodayStrip(supabase),
      getPlanUsage(supabase),
    ]);

  const list = (projects ?? []) as Project[];

  // Flow 1 — zero projects means a brand-new account: one card, one input.
  if (list.length === 0) {
    return (
      <div className="px-5 md:px-8">
        <FirstRunCard />
      </div>
    );
  }

  const clientOptions = (clients ?? []).map((c) => ({ id: c.id, name: c.name }));
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
  const rollupByProject = new Map<string, ProjectRollup>();
  for (const r of rollups ?? []) if (r.project_id) rollupByProject.set(r.project_id, r);

  const active = list.filter((p) => !p.is_archived);
  const needsClient = active.filter((p) => p.is_billable && !p.client_id).length;

  const cur = metrics.currency;
  const billHours = metrics.thisWeek.billableSeconds / 3600;
  const nonHours = metrics.thisWeek.nonBillableSeconds / 3600;
  const totalWeek = billHours + nonHours;
  const billPct = totalWeek > 0 ? (billHours / totalWeek) * 100 : 100;

  const sinceMon = (new Date().getUTCDay() + 6) % 7;
  const todayEarnings = metrics.daily[Math.min(6, sinceMon)] ?? 0;

  const up = metrics.deltaPct != null && metrics.deltaPct >= 0;

  return (
    <div className="page">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-ink-2 mt-1">
            Here’s what you’ve earned this week.
          </p>
        </div>
        <ProjectForm
          clients={clientOptions}
          variant="ghost"
          usageHint={
            usage.tier === "free" &&
            usage.projects.used >= usage.projects.limit - 1
              ? `${usage.projects.used} of ${usage.projects.limit} free projects`
              : undefined
          }
        />
      </div>

      {/* Today strip — tracked time + what's running now */}
      <div className="panel px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="label">Today</span>
        <span className="num text-lg font-semibold leading-none">
          {formatClock(today.trackedSeconds)}
        </span>
        <span className="text-xs text-ink-3">tracked</span>
        <span className="ml-auto min-w-0">
          {today.running ? (
            <span className="flex items-center gap-2 text-sm min-w-0">
              <span className="live-dot shrink-0" aria-hidden />
              <span className="font-semibold truncate">{today.running.taskName}</span>
              {today.running.projectName && (
                <span className="text-ink-3 truncate">· {today.running.projectName}</span>
              )}
            </span>
          ) : (
            <span className="text-sm text-ink-3">Nothing running — start above</span>
          )}
        </span>
      </div>

      {/* Hero — billable earnings */}
      <div className="rounded-[var(--radius-card)] overflow-hidden border grid md:grid-cols-[1.15fr_1fr]"
        style={{
          borderColor: "var(--line)",
          background:
            "radial-gradient(560px 260px at 18% 130%, var(--gold-dim), transparent 62%), var(--paper-2)",
          boxShadow: "0 1px 2px rgba(15,26,28,0.04)",
        }}
      >
        <div className="p-6 md:border-r border-b md:border-b-0 border-line">
          <div className="label text-gold flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-gold inline-block" />
            Projected earnings · this week
          </div>
          <div className="serif text-ink leading-none mt-3 inline-block"
            style={{ fontSize: "clamp(2.6rem, 6vw, 3.75rem)" }}
          >
            {formatMoney(metrics.thisWeek.earnings, cur)}
            <span className="block mt-2 h-0.5 w-14 rounded-full" style={{ background: "var(--brass)" }} />
          </div>
          <div className="num text-sm text-ink-2 mt-3">
            <b className="text-ink font-semibold">{billHours.toFixed(1)} h</b>{" "}
            billable · avg{" "}
            {formatMoney(billHours > 0 ? metrics.thisWeek.earnings / billHours : 0, cur)}/hr
          </div>
          <div className="mt-5">
            <div className="split">
              <i className="bill" style={{ width: `${billPct}%` }} />
              <i className="non" style={{ width: `${100 - billPct}%` }} />
            </div>
            <div className="flex gap-5 mt-2 text-[0.7rem] text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-[2px] bg-gold inline-block" />
                Billable {billHours.toFixed(1)} h
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-[2px] bg-steel inline-block" />
                Non-billable {nonHours.toFixed(1)} h
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 flex flex-col justify-center gap-4">
          <div className="flex items-baseline gap-2.5">
            {metrics.deltaPct != null ? (
              <>
                <span
                  className="num text-lg font-semibold"
                  style={{ color: up ? "var(--gold)" : "var(--steel)" }}
                >
                  {up ? "▲" : "▼"} {Math.abs(metrics.deltaPct).toFixed(0)}%
                </span>
                <span className="text-xs text-ink-2">
                  vs last week · {formatMoney(metrics.lastWeek.earnings, cur)}
                </span>
              </>
            ) : (
              <span className="text-xs text-ink-3">
                No earnings last week to compare
              </span>
            )}
          </div>
          <div className="flex items-end gap-3">
            <Sparkline values={metrics.daily} />
            <div className="text-[0.7rem] text-ink-3">
              Today
              <b className="num block text-[0.95rem] text-ink font-semibold">
                {formatMoney(todayEarnings, cur)}
              </b>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid sm:grid-cols-3 gap-3">
        {/* Unbilled — actionable: every client row bridges straight to the invoice flow */}
        <div className="panel p-4">
          <div className="label flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-[2px] bg-gold inline-block" />
            Unbilled
          </div>
          <div className="num text-2xl text-gold mt-2">
            {formatMoney(unbilled.total, unbilled.currency)}
          </div>
          {unbilled.perClient.length === 0 ? (
            <div className="text-[0.7rem] text-ink-2 mt-1">Nothing unbilled yet</div>
          ) : (
            <ul className="mt-3">
              {unbilled.perClient.map((r) => (
                <li key={r.clientId} className="flex items-center gap-2 py-2 rule-t">
                  <span className="text-sm font-semibold truncate">{r.clientName}</span>
                  <span className="num text-sm text-gold ml-auto shrink-0">
                    {formatMoney(r.amount, r.currency)}
                  </span>
                  <Link
                    href={`/invoices?client=${r.clientId}`}
                    className="btn btn-sm shrink-0"
                  >
                    Invoice →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel p-4">
          <div className="label flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-[2px] border border-steel inline-block" />
            Non-billable this week
          </div>
          <div className="num text-2xl text-steel mt-2">{nonHours.toFixed(1)} h</div>
          <div className="text-[0.7rem] text-ink-2 mt-1">admin, learning, internal</div>
        </div>
        <div className="panel p-4">
          <div className="label">Active projects</div>
          <div className="num text-2xl mt-2">{active.length}</div>
          <div className="text-[0.7rem] mt-1"
            style={{ color: needsClient > 0 ? "var(--danger)" : "var(--ink-2)" }}
          >
            {needsClient > 0 ? `${needsClient} needs a client` : "all set to bill"}
          </div>
        </div>
      </div>

      {/* Projects */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="panel-title">Projects</h2>
          <span className="num text-xs text-ink-3">{list.length}</span>
        </div>

        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse min-w-[480px] sm:min-w-[620px]">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left label font-semibold px-4 py-3 rule-b">Project</th>
                <th className="text-left label font-semibold px-4 py-3 rule-b">Client</th>
                <th className="hidden sm:table-cell text-left label font-semibold px-4 py-3 rule-b">Billable split</th>
                <th className="text-right label font-semibold px-4 py-3 rule-b">Tracked</th>
                <th className="text-right label font-semibold px-4 py-3 rule-b">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const r = rollupByProject.get(p.id);
                const total = r?.total_seconds ?? 0;
                const bill = r?.billable_seconds ?? 0;
                const client = p.client_id ? clientById.get(p.client_id) : null;
                const rate = p.rate ?? client?.default_rate ?? 0;
                const earnings = (bill / 3600) * rate;
                const pct = total > 0 ? (bill / total) * 100 : p.is_billable ? 100 : 0;
                const noClient = p.is_billable && !p.client_id;
                return (
                  <tr key={p.id} className="rule-b last:border-b-0 hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${p.id}`} className="flex items-center gap-3 min-w-0 hover:text-gold transition-colors">
                        <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: p.color }} />
                        <span className="font-semibold text-sm truncate">{p.name}</span>
                        {p.code && <span className="num text-[0.7rem] text-ink-3 shrink-0">{p.code}</span>}
                        {p.is_archived && <span className="text-[0.7rem] text-ink-3 shrink-0">· archived</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {noClient ? (
                        <Link href={`/projects/${p.id}`} className="badge badge-warn">⚠ No client</Link>
                      ) : (
                        <span className="text-sm text-ink-2 truncate">
                          {client?.name ?? p.client ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 min-w-[118px]">
                      <div className="split">
                        {pct > 0 && <i className="bill" style={{ width: `${pct}%` }} />}
                        {pct < 100 && <i className="non" style={{ width: `${100 - pct}%` }} />}
                      </div>
                      <div className="num text-[0.65rem] text-ink-3 mt-1.5">
                        {p.is_billable ? `${Math.round(pct)}% billable` : "non-billable"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right num text-sm">{formatHours(total)} h</td>
                    <td className="px-4 py-3 text-right">
                      {!p.is_billable ? (
                        <span className="badge badge-non"><span className="dot" />Non-billable</span>
                      ) : noClient ? (
                        <span className="text-[0.7rem] text-ink-3">Set client to bill</span>
                      ) : (
                        <span className="num text-sm text-gold font-semibold">
                          {formatMoney(earnings, cur)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
