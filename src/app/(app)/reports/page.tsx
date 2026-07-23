import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/plan";
import { formatMoney } from "@/lib/invoice";
import { formatClock } from "@/lib/time";
import { REPORT_RANGES, resolveRange } from "@/lib/reports";

const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || null;

/** Unwrap a Supabase embedded to-one relation. */
function one<T>(rel: unknown): T | undefined {
  return (Array.isArray(rel) ? rel[0] : rel) as T | undefined;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type ProjectRow = {
  id: string;
  name: string;
  clientName: string | null;
  currency: string;
  seconds: number;
  billableSeconds: number;
  earnings: number;
};
type ClientRow = {
  key: string;
  name: string;
  currency: string;
  seconds: number;
  billableSeconds: number;
  earnings: number;
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const range = resolveRange(first(sp.range));

  const supabase = await createClient();
  const [{ data: entries }, plan] = await Promise.all([
    supabase
      .from("time_entries")
      .select(
        "duration_seconds, is_billable, tasks!inner(projects!inner(id, name, rate, client_id, clients(id, name, default_rate, currency)))",
      )
      .gte("started_at", range.start.toISOString())
      .lt("started_at", range.end.toISOString())
      .not("ended_at", "is", null),
    getPlan(supabase),
  ]);

  const rows = entries ?? [];

  // Header actions shared across states.
  const RangeTabs = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="label">Range</span>
      {REPORT_RANGES.map((r) => (
        <Link
          key={r.key}
          href={`/reports?range=${r.key}`}
          className={
            r.key === range.key
              ? "text-ink font-medium"
              : "text-ink-3 hover:text-ink transition-colors"
          }
        >
          {r.label}
        </Link>
      ))}
    </div>
  );

  const ExportControl = plan.canExport ? (
    <a href={`/reports/export?range=${range.key}`} className="btn btn-sm">
      ↓ Export CSV
    </a>
  ) : (
    // Never a dead click — the locked chip routes to the upgrade surface.
    <Link href="/plan" className="btn btn-sm text-ink-3" title="CSV export is a Pro feature">
      <span aria-hidden>🔒</span> CSV export — Pro
    </Link>
  );

  const header = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-ink-2 mt-1">
            {range.label} · <span className="num">{range.periodLabel}</span>
          </p>
        </div>
        {ExportControl}
      </div>
      {RangeTabs}
    </div>
  );

  // Empty state (plan §8): one sentence + one button back to the loop.
  if (rows.length === 0) {
    return (
      <div className="page">
        {header}
        <div className="panel px-6 py-10 text-center flex flex-col items-center gap-4">
          <p className="text-sm text-ink-2 max-w-md mx-auto">
            No time tracked in this range yet — start a timer and it shows up here.
          </p>
          <Link href="/" className="btn btn-accent">
            Go to Today
          </Link>
        </div>
      </div>
    );
  }

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const byProject = new Map<string, ProjectRow>();
  const byClient = new Map<string, ClientRow>();
  const earningsByCurrency = new Map<string, number>();
  let totalSeconds = 0;
  let totalBillableSeconds = 0;

  for (const e of rows) {
    const task = one<{ projects: unknown }>(e.tasks);
    const project = one<{
      id: string;
      name: string;
      rate: number | null;
      client_id: string | null;
      clients: unknown;
    }>(task?.projects);
    if (!project) continue;
    const client = one<{
      id: string;
      name: string;
      default_rate: number | null;
      currency: string;
    }>(project.clients);

    const seconds = e.duration_seconds ?? 0;
    const rate = project.rate ?? client?.default_rate ?? 0;
    const currency = client?.currency ?? "USD";
    const money = e.is_billable ? (seconds / 3600) * rate : 0;

    totalSeconds += seconds;
    if (e.is_billable) totalBillableSeconds += seconds;
    if (money > 0) earningsByCurrency.set(currency, (earningsByCurrency.get(currency) ?? 0) + money);

    const pRow = byProject.get(project.id) ?? {
      id: project.id,
      name: project.name,
      clientName: client?.name ?? null,
      currency,
      seconds: 0,
      billableSeconds: 0,
      earnings: 0,
    };
    pRow.seconds += seconds;
    if (e.is_billable) pRow.billableSeconds += seconds;
    pRow.earnings += money;
    byProject.set(project.id, pRow);

    const clientKey = client?.id ?? "none";
    const cRow = byClient.get(clientKey) ?? {
      key: clientKey,
      name: client?.name ?? "No client",
      currency,
      seconds: 0,
      billableSeconds: 0,
      earnings: 0,
    };
    cRow.seconds += seconds;
    if (e.is_billable) cRow.billableSeconds += seconds;
    cRow.earnings += money;
    byClient.set(clientKey, cRow);
  }

  const billPct = totalSeconds > 0 ? (totalBillableSeconds / totalSeconds) * 100 : 0;

  const projectRows = [...byProject.values()].sort(
    (a, b) => b.earnings - a.earnings || b.seconds - a.seconds,
  );
  const clientRows = [...byClient.values()].sort(
    (a, b) => b.earnings - a.earnings || b.seconds - a.seconds,
  );
  // Mixed currencies are grouped, never summed across (plan §8).
  const earnings = [...earningsByCurrency.entries()]
    .map(([currency, amount]) => ({ currency, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="page">
      {header}

      {/* Totals strip */}
      <div className="panel p-5 grid sm:grid-cols-3 gap-5 sm:gap-4">
        <div>
          <div className="label">Tracked</div>
          <div className="num text-2xl mt-2">{formatClock(totalSeconds)}</div>
        </div>
        <div>
          <div className="label">Billable share</div>
          <div className="mt-3">
            <div className="split">
              {billPct > 0 && <i className="bill" style={{ width: `${billPct}%` }} />}
              {billPct < 100 && <i className="non" style={{ width: `${100 - billPct}%` }} />}
            </div>
            <div className="num text-[0.7rem] text-ink-3 mt-1.5">
              {Math.round(billPct)}% billable · {formatClock(totalBillableSeconds)}
            </div>
          </div>
        </div>
        <div>
          <div className="label">Earnings</div>
          {earnings.length === 0 ? (
            <div className="num text-2xl text-ink-3 mt-2">—</div>
          ) : (
            <div className="mt-2 flex flex-col gap-0.5">
              {earnings.map((e) => (
                <div key={e.currency} className="num text-2xl text-gold leading-tight">
                  {formatMoney(e.amount, e.currency)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* By client */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="panel-title">By client</h2>
          <span className="num text-xs text-ink-3">{clientRows.length}</span>
        </div>
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse min-w-[480px]">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left label font-semibold px-4 py-3 rule-b">Client</th>
                <th className="text-right label font-semibold px-4 py-3 rule-b">Tracked</th>
                <th className="text-right label font-semibold px-4 py-3 rule-b">Billable</th>
                <th className="text-right label font-semibold px-4 py-3 rule-b">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {clientRows.map((c) => (
                <tr key={c.key} className="rule-b last:border-b-0 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold truncate">{c.name}</td>
                  <td className="px-4 py-3 text-right num text-sm">{formatClock(c.seconds)}</td>
                  <td className="px-4 py-3 text-right num text-sm text-ink-2">
                    {formatClock(c.billableSeconds)}
                  </td>
                  <td className="px-4 py-3 text-right num text-sm text-gold font-semibold">
                    {c.earnings > 0 ? formatMoney(round2(c.earnings), c.currency) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* By project */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="panel-title">By project</h2>
          <span className="num text-xs text-ink-3">{projectRows.length}</span>
        </div>
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse min-w-[560px]">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left label font-semibold px-4 py-3 rule-b">Project</th>
                <th className="text-left label font-semibold px-4 py-3 rule-b">Client</th>
                <th className="text-right label font-semibold px-4 py-3 rule-b">Tracked</th>
                <th className="text-right label font-semibold px-4 py-3 rule-b">Billable</th>
                <th className="text-right label font-semibold px-4 py-3 rule-b">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {projectRows.map((p) => (
                <tr key={p.id} className="rule-b last:border-b-0 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold truncate">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-ink-2 truncate">{p.clientName ?? "—"}</td>
                  <td className="px-4 py-3 text-right num text-sm">{formatClock(p.seconds)}</td>
                  <td className="px-4 py-3 text-right num text-sm text-ink-2">
                    {formatClock(p.billableSeconds)}
                  </td>
                  <td className="px-4 py-3 text-right num text-sm text-gold font-semibold">
                    {p.earnings > 0 ? formatMoney(round2(p.earnings), p.currency) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
