import { createClient } from "@/lib/supabase/server";
import { TaskForm } from "@/components/TaskForm";
import { TaskTree, type TaskNode } from "@/components/TaskTree";
import { ClientPanel } from "@/components/ClientPanel";
import { WeeklyChart } from "@/components/WeeklyChart";
import { formatHours } from "@/lib/time";
import { formatMoney } from "@/lib/invoice";
import { getProjectMetrics } from "@/lib/projectMetrics";
import type { Client, Project, Task, TaskRollup } from "@/lib/database.types";

/**
 * OVERVIEW PANEL — owned by the analytics/billing workstream.
 *
 * Self-fetching: it takes only the project, its client, and the resolved rate,
 * then reads whatever else it needs. That keeps this panel editable without
 * touching page.tsx or the other panels.
 */
export async function OverviewPanel({
  projectId,
  project,
  client,
  clients,
  effectiveRate,
  currency,
  canUseAdvanced,
}: {
  projectId: string;
  project: Project;
  client: Pick<
    Client,
    "id" | "name" | "email" | "default_rate" | "currency" | "tax_label" | "tax_rate"
  > | null;
  clients: { id: string; name: string }[];
  effectiveRate: number | null;
  currency: string;
  canUseAdvanced: boolean;
}) {
  const supabase = await createClient();

  const [{ data: projRollup }, metrics, { data: tasks }, { data: rollups }, { data: running }] =
    await Promise.all([
      supabase
        .from("project_rollups")
        .select("billable_seconds, total_seconds, entry_count")
        .eq("project_id", projectId)
        .maybeSingle(),
      getProjectMetrics(supabase, projectId),
      supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.from("task_rollups").select("*").eq("project_id", projectId),
      supabase
        .from("time_entries")
        .select("id, task_id, started_at, tasks!inner(project_id)")
        .eq("tasks.project_id", projectId)
        .is("ended_at", null),
    ]);

  const taskList = (tasks ?? []) as Task[];
  const billableSeconds = projRollup?.billable_seconds ?? 0;
  const totalSeconds = projRollup?.total_seconds ?? 0;
  const billPct =
    totalSeconds > 0
      ? (billableSeconds / totalSeconds) * 100
      : project.is_billable
        ? 100
        : 0;
  const earnings =
    effectiveRate != null ? (billableSeconds / 3600) * effectiveRate : null;
  const unbilledAmount =
    effectiveRate != null
      ? (metrics.unbilledSeconds / 3600) * effectiveRate
      : null;

  const loggedByTask = new Map<string, number>();
  for (const r of (rollups ?? []) as TaskRollup[]) {
    if (r.task_id) loggedByTask.set(r.task_id, r.total_seconds ?? 0);
  }
  const runningByTask = new Map<string, { id: string; started_at: string }>();
  for (const e of running ?? []) {
    if (!runningByTask.has(e.task_id)) {
      runningByTask.set(e.task_id, { id: e.id, started_at: e.started_at });
    }
  }

  const childrenOf = new Map<string | null, Task[]>();
  for (const t of taskList) {
    const bucket = childrenOf.get(t.parent_id) ?? [];
    bucket.push(t);
    childrenOf.set(t.parent_id, bucket);
  }
  const buildNode = (t: Task): TaskNode => ({
    id: t.id,
    name: t.name,
    isBillable: t.is_billable,
    running: runningByTask.get(t.id) ?? null,
    loggedSeconds: loggedByTask.get(t.id) ?? 0,
    children: (childrenOf.get(t.id) ?? []).map(buildNode),
  });
  const taskTree = (childrenOf.get(null) ?? []).map(buildNode);

  const sinceMon = (new Date().getUTCDay() + 6) % 7;
  const todayIndex = Math.min(6, sinceMon);

  const rateLabel =
    effectiveRate != null ? `${formatMoney(effectiveRate, currency)}` : "No rate";
  const rateSource =
    project.rate != null
      ? "Project override"
      : client?.default_rate != null
        ? "Inherited from client"
        : "Set a rate to bill";
  const taxLabel =
    client && Number(client.tax_rate) > 0
      ? `${Number(client.tax_rate)}%${client.tax_label ? ` ${client.tax_label}` : ""}`
      : null;

  return (
    <>
      <section className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <div
          className="panel p-5"
          style={{
            background:
              "radial-gradient(420px 200px at 10% 120%, var(--gold-dim), transparent 60%), var(--paper-2)",
          }}
        >
          <div className="label flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-gold inline-block" />
            Billable earnings
          </div>
          <div
            className="num text-2xl leading-none mt-3"
            style={{ color: earnings != null ? "var(--gold)" : "var(--ink-3)" }}
          >
            {earnings != null ? formatMoney(earnings, currency) : "—"}
          </div>
          <div className="text-[0.7rem] text-ink-3 mt-2">
            {effectiveRate != null
              ? `${formatHours(billableSeconds)} h at ${formatMoney(effectiveRate, currency)}/h`
              : "Set a client and rate to bill"}
          </div>
        </div>

        <div className="panel p-5">
          <div className="label">Tracked</div>
          <div className="num text-2xl leading-none mt-3">
            {formatHours(totalSeconds)} h
          </div>
          <div className="text-[0.7rem] text-ink-3 mt-2">
            {projRollup?.entry_count ?? 0} entries · {taskList.length} tasks
          </div>
        </div>

        <div className="panel p-5">
          <div className="label">This week</div>
          <div className="num text-2xl leading-none mt-3">
            {formatHours(metrics.weekTotalSeconds)} h
          </div>
          <div className="text-[0.7rem] text-ink-3 mt-2">
            {formatHours(metrics.todaySeconds)} h today
          </div>
        </div>

        <div className="panel p-5 flex flex-col">
          <div className="label">Billable split</div>
          <div className="num text-2xl leading-none mt-3">
            {Math.round(billPct)}%
          </div>
          <div className="mt-auto pt-3">
            <div className="split">
              {billPct > 0 && (
                <i className="bill" style={{ width: `${billPct}%` }} />
              )}
              {billPct < 100 && (
                <i className="non" style={{ width: `${100 - billPct}%` }} />
              )}
            </div>
            <div className="num text-[0.65rem] text-ink-3 mt-2">
              {formatHours(totalSeconds - billableSeconds)} h non-billable
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.65fr_1fr] items-start">
        <div className="panel overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-3 p-5 pb-4">
            <div className="flex items-baseline gap-2">
              <h2 className="panel-title">Quick start</h2>
              <span className="num text-xs text-ink-3">{taskList.length}</span>
            </div>
            <span className="text-[0.7rem] text-ink-3">Press Start to track</span>
          </div>

          {taskTree.length === 0 ? (
            <div className="px-5 py-10 text-center rule-t">
              <p className="font-medium mb-1">No tasks yet</p>
              <p className="text-sm text-ink-2">
                Add your first task below, then press Start to track time.
              </p>
            </div>
          ) : (
            <div className="rule-t">
              <TaskTree
                projectId={projectId}
                nodes={taskTree}
                canAddSubtasks={canUseAdvanced}
              />
            </div>
          )}

          <div className="p-4 rule-t bg-surface-2">
            <TaskForm projectId={projectId} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <ClientPanel
            projectId={projectId}
            clients={clients}
            currentClientId={project.client_id}
            currentRate={project.rate}
            client={
              client
                ? { id: client.id, name: client.name, email: client.email }
                : null
            }
            rateLabel={rateLabel}
            rateSource={rateSource}
            unbilledLabel={
              unbilledAmount != null
                ? formatMoney(unbilledAmount, currency)
                : null
            }
            unbilledHours={formatHours(metrics.unbilledSeconds)}
            taxLabel={taxLabel}
          />

          <div className="panel p-5 flex flex-col gap-4">
            <span className="label">This week · by day</span>
            <WeeklyChart
              values={metrics.weekSeconds}
              todayIndex={todayIndex}
              currency={currency}
              unit="hours"
              tone="accent"
            />
            <div className="flex items-end justify-between gap-3 pt-4 rule-t">
              <div>
                <div className="num text-lg leading-none text-accent">
                  {formatHours(metrics.weekBillableSeconds)} h
                </div>
                <div className="label mt-1.5">Billable</div>
              </div>
              <div className="text-right">
                <div className="num text-lg leading-none text-ink-2">
                  {formatHours(
                    metrics.weekTotalSeconds - metrics.weekBillableSeconds,
                  )}{" "}
                  h
                </div>
                <div className="label mt-1.5">Non-billable</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
