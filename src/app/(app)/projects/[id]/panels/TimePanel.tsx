import { createClient } from "@/lib/supabase/server";
import { ManualEntryForm } from "@/components/ManualEntryForm";
import { EntryRow } from "@/components/EntryRow";
import { formatDuration, formatHours } from "@/lib/time";
import { formatMoney } from "@/lib/invoice";
import { getTaskTree } from "../data";

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function fmtDayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Local calendar day key, so entries group the way the user experienced them. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function TimePanel({
  projectId,
  effectiveRate,
  currency,
}: {
  projectId: string;
  effectiveRate: number | null;
  currency: string;
}) {
  const supabase = await createClient();

  const [{ data: entries }, { tasks }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("*, tasks!inner(name, project_id)")
      .eq("tasks.project_id", projectId)
      .order("started_at", { ascending: false })
      .limit(100),
    getTaskTree(projectId),
  ]);

  const entryList = entries ?? [];
  const taskOptions = tasks.map((t) => ({ id: t.id, name: t.name }));
  // Pre-select the most recently tracked task when adding time by hand.
  const defaultTaskId = entryList[0]?.task_id;
  const notedCount = entryList.filter((e) => (e.notes ?? "").trim()).length;

  const groups: {
    key: string;
    label: string;
    seconds: number;
    rows: typeof entryList;
  }[] = [];
  for (const e of entryList) {
    const key = dayKey(e.started_at);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: fmtDayLabel(e.started_at), seconds: 0, rows: [] };
      groups.push(group);
    }
    group.rows.push(e);
    group.seconds += e.duration_seconds ?? 0;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="panel-title">Time entries</h2>
          <span className="num text-xs text-ink-3">{entryList.length}</span>
          <span className="text-[0.7rem] text-ink-3">
            · {notedCount} with notes
          </span>
        </div>
        <ManualEntryForm
          projectId={projectId}
          tasks={taskOptions}
          defaultTaskId={defaultTaskId}
        />
      </div>

      {entryList.length === 0 ? (
        <div className="panel py-12 px-6 text-center">
          <p className="font-medium mb-1">No time tracked yet</p>
          <p className="text-sm text-ink-2">
            Start a timer from the Tasks view, or add time by hand above.
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-surface-2 rule-b">
                <span className="label">{group.label}</span>
                <span className="num text-xs text-ink-2">
                  {formatHours(group.seconds)} h
                </span>
              </div>
              {group.rows.map((e) => {
                const amount =
                  e.is_billable &&
                  effectiveRate != null &&
                  e.duration_seconds != null
                    ? (e.duration_seconds / 3600) * effectiveRate
                    : null;
                return (
                  <EntryRow
                    key={e.id}
                    entryId={e.id}
                    projectId={projectId}
                    taskId={e.task_id}
                    taskName={e.tasks.name}
                    tasks={taskOptions}
                    startedAtIso={e.started_at}
                    endedAtIso={e.ended_at}
                    notes={e.notes}
                    isBillable={e.is_billable}
                    rangeLabel={
                      e.ended_at
                        ? `${fmtTime(e.started_at)} → ${fmtTime(e.ended_at)}`
                        : `${fmtTime(e.started_at)} →`
                    }
                    durationLabel={
                      e.ended_at ? formatDuration(e.duration_seconds) : null
                    }
                    amountLabel={
                      amount != null ? formatMoney(amount, currency) : null
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
