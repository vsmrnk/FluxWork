import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TaskForm } from "@/components/TaskForm";
import { TaskTree, type TaskNode } from "@/components/TaskTree";
import { ManualEntryForm } from "@/components/ManualEntryForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { BillableToggle } from "@/components/BillableToggle";
import { ProjectBillingForm } from "@/components/ProjectBillingForm";
import { InlineClientForm } from "@/components/InlineClientForm";
import { ProjectOverflowMenu } from "@/components/ProjectOverflowMenu";
import { formatDuration, formatHours } from "@/lib/time";
import { formatMoney } from "@/lib/invoice";
import { getPlan } from "@/lib/plan";
import { deleteEntry } from "@/app/actions/time";
import type { Task, TaskRollup, TimeEntry } from "@/lib/database.types";

type EntryWithTask = TimeEntry & { tasks: { name: string } | null };

function fmtStamp(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const [{ data: clients }, { data: linkedClient }, { data: projRollup }, plan] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        .eq("is_archived", false)
        .order("name", { ascending: true }),
      project.client_id
        ? supabase
            .from("clients")
            .select("id, name, default_rate, currency")
            .eq("id", project.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("project_rollups")
        .select("billable_seconds, total_seconds")
        .eq("project_id", id)
        .maybeSingle(),
      getPlan(supabase),
    ]);

  const clientOptions = clients ?? [];
  const effectiveRate = project.rate ?? linkedClient?.default_rate ?? null;
  const cur = linkedClient?.currency ?? "USD";
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
  const noClient = project.is_billable && !project.client_id;

  const [{ data: tasks }, { data: rollups }, { data: entries }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: true }),
      supabase.from("task_rollups").select("*").eq("project_id", id),
      supabase
        .from("time_entries")
        .select("*, tasks!inner(name, project_id)")
        .eq("tasks.project_id", id)
        .order("started_at", { ascending: false })
        .limit(50),
    ]);

  const taskList = (tasks ?? []) as Task[];
  const entryList = (entries ?? []) as EntryWithTask[];

  const loggedByTask = new Map<string, number>();
  for (const r of (rollups ?? []) as TaskRollup[]) {
    if (r.task_id) loggedByTask.set(r.task_id, r.total_seconds ?? 0);
  }

  const runningByTask = new Map<string, { id: string; started_at: string }>();
  for (const e of entryList) {
    if (e.ended_at === null && !runningByTask.has(e.task_id)) {
      runningByTask.set(e.task_id, { id: e.id, started_at: e.started_at });
    }
  }

  const taskOptions = taskList.map((t) => ({ id: t.id, name: t.name }));
  // Pre-select the most recently tracked task when adding time by hand.
  const defaultTaskId = entryList[0]?.task_id;

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

  const rateLabel =
    effectiveRate != null ? `${formatMoney(effectiveRate, cur)}/h` : "no rate";
  const clientRateSummary = `${linkedClient?.name ?? "No client"} · ${rateLabel}`;

  return (
    <div className="page">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-ink-3">
        <Link href="/" className="hover:text-ink transition-colors">Today</Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2 truncate">{project.name}</span>
      </nav>

      {/* Header — name, client · rate, earnings/tracked, overflow menu */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-1.5 h-3.5 w-3.5 rounded-[3px] shrink-0" style={{ background: project.color }} aria-hidden />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{project.name}</h1>
            <p className="text-sm text-ink-2 mt-1">
              {[
                linkedClient?.name ?? project.client,
                project.code,
                effectiveRate != null ? `${formatMoney(effectiveRate, cur)}/h` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "No client set"}
              {project.is_archived && " · Archived"}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-6">
          <div className="flex items-center gap-7">
            <div>
              <div className="num text-2xl leading-none" style={{ color: earnings != null ? "var(--gold)" : "var(--ink-3)" }}>
                {earnings != null ? formatMoney(earnings, cur) : "—"}
              </div>
              <div className="label mt-1.5">Billable earnings</div>
            </div>
            <div>
              <div className="num text-2xl leading-none text-ink-2">{formatHours(totalSeconds)} h</div>
              <div className="label mt-1.5">Tracked</div>
            </div>
          </div>
          <ProjectOverflowMenu projectId={id} isArchived={project.is_archived} />
        </div>
      </div>

      {/* Billable split */}
      {totalSeconds > 0 && (
        <div>
          <div className="split max-w-md">
            {billPct > 0 && <i className="bill" style={{ width: `${billPct}%` }} />}
            {billPct < 100 && <i className="non" style={{ width: `${100 - billPct}%` }} />}
          </div>
          <div className="flex gap-5 mt-2 text-[0.7rem] text-ink-3">
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px] bg-gold inline-block" />Billable {formatHours(billableSeconds)} h</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px] bg-steel inline-block" />Non-billable {formatHours(totalSeconds - billableSeconds)} h</span>
          </div>
        </div>
      )}

      {/* No-client guard — warning carries its fix (plan §4.6) */}
      {noClient && (
        <div className="panel p-4 flex flex-col gap-3" style={{ borderColor: "var(--danger-line)", background: "var(--danger-dim)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="badge badge-warn">⚠ No client</span>
            <p className="text-sm text-ink-2 flex-1 min-w-[200px]">
              Can’t invoice yet — this project has no client.
            </p>
          </div>
          <div>
            <InlineClientForm projectId={id} triggerLabel="Add client" variant="accent" />
          </div>
        </div>
      )}

      {/* Tasks & time — the default, primary content */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="panel-title">Tasks</h2>
          <span className="num text-xs text-ink-3">{taskList.length}</span>
        </div>
        {taskTree.length === 0 ? (
          <div className="panel py-12 px-6 text-center">
            <p className="font-medium mb-1">No tasks yet</p>
            <p className="text-sm text-ink-2">
              Add your first task below, then press Start to track time.
            </p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <TaskTree projectId={id} nodes={taskTree} canAddSubtasks={plan.canUseAdvanced} />
          </div>
        )}
        <div><TaskForm projectId={id} /></div>
      </section>

      {/* Tracked time (recent) */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="panel-title">Tracked time</h2>
            <span className="num text-xs text-ink-3">{entryList.length}</span>
          </div>
          <ManualEntryForm projectId={id} tasks={taskOptions} defaultTaskId={defaultTaskId} />
        </div>

        {entryList.length === 0 ? (
          <div className="panel py-12 px-6 text-center">
            <p className="font-medium mb-1">No time tracked yet</p>
            <p className="text-sm text-ink-2">Start a timer on a task above to track your first minutes.</p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            {entryList.map((e) => {
              const amount =
                e.is_billable && effectiveRate != null && e.duration_seconds != null
                  ? (e.duration_seconds / 3600) * effectiveRate
                  : null;
              return (
                <div key={e.id} className="grid grid-cols-12 items-center gap-2 px-4 py-3 rule-b last:border-b-0 hover:bg-surface-2 transition-colors">
                  <div className="col-span-12 sm:col-span-5 min-w-0">
                    <p className="truncate text-sm font-medium">{e.tasks?.name ?? "—"}</p>
                    {e.notes && <p className="truncate text-xs text-ink-3">{e.notes}</p>}
                    <div className="mt-1.5">
                      <BillableToggle entryId={e.id} projectId={id} isBillable={e.is_billable} />
                    </div>
                  </div>
                  <div className="col-span-6 sm:col-span-4 num text-xs text-ink-2">
                    {fmtStamp(e.started_at)} {" → "}
                    {e.ended_at ? fmtStamp(e.ended_at) : <span className="text-accent">running</span>}
                  </div>
                  <div className="col-span-4 sm:col-span-2 text-right num text-sm">
                    {e.ended_at ? formatDuration(e.duration_seconds) : <span className="live-dot inline-block align-middle" />}
                    {amount != null && (
                      <div className="num text-[0.7rem] text-gold mt-0.5">{formatMoney(amount, cur)}</div>
                    )}
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-end">
                    <ConfirmAction action={deleteEntry.bind(null, e.id, id)} label="✕" confirmLabel="Remove?" className="btn btn-ghost btn-sm" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Client & rate — configuration, collapsed by default (auto-open when
          the project is billable with no client). */}
      <details open={noClient} className="panel group">
        <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-baseline gap-2 min-w-0">
            <h2 className="panel-title">Client &amp; rate</h2>
            <span className="num text-xs text-ink-3 truncate">{clientRateSummary}</span>
          </div>
          <span className="text-ink-3 text-sm transition-transform group-open:rotate-180" aria-hidden>▾</span>
        </summary>
        <div className="p-4 pt-0 flex flex-col gap-4">
          <ProjectBillingForm
            projectId={id}
            clients={clientOptions}
            currentClientId={project.client_id}
            currentRate={project.rate}
          />
          <div className="flex flex-wrap items-center gap-3">
            <InlineClientForm projectId={id} />
            {project.client_id && (
              <Link href={`/invoices?client=${project.client_id}`} className="btn btn-accent btn-sm ml-auto">
                Create invoice →
              </Link>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
