import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TaskForm } from "@/components/TaskForm";
import { TaskTree, type TaskNode } from "@/components/TaskTree";
import type { Task, TaskRollup } from "@/lib/database.types";

/**
 * TASKS PANEL — owned by the task-management workstream.
 *
 * Self-fetching so it can grow (estimates, descriptions, status, ordering,
 * drag-and-drop) without touching page.tsx or the other panels.
 */
export async function TasksPanel({
  projectId,
  canUseAdvanced,
}: {
  projectId: string;
  canUseAdvanced: boolean;
}) {
  const supabase = await createClient();

  const [{ data: tasks }, { data: rollups }, { data: running }] =
    await Promise.all([
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
  const runningCount = runningByTask.size;

  return (
    <>
      <div className="panel p-5">
        <h2 className="panel-title mb-1">Add a task</h2>
        <p className="text-sm text-ink-2 mb-4">
          Tasks are what you track time against — one per piece of work.
        </p>
        <TaskForm projectId={projectId} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="panel-title">All tasks</h2>
            <span className="num text-xs text-ink-3">{taskList.length}</span>
          </div>
          {runningCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-accent font-semibold">
              <i className="live-dot" aria-hidden />
              {runningCount === 1
                ? "1 timer running"
                : `${runningCount} timers running`}
            </span>
          )}
        </div>

        {taskTree.length === 0 ? (
          <div className="panel py-12 px-6 text-center">
            <p className="font-medium mb-1">No tasks yet</p>
            <p className="text-sm text-ink-2">
              Add one above to start tracking time against it.
            </p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <TaskTree
              projectId={projectId}
              nodes={taskTree}
              canAddSubtasks={canUseAdvanced}
              manage
            />
          </div>
        )}

        {!canUseAdvanced && taskTree.length > 0 && (
          <p className="text-[0.7rem] text-ink-3">
            Subtasks are a Pro feature —{" "}
            <Link href="/plan" className="text-accent hover:underline">
              see the Plan page
            </Link>
            .
          </p>
        )}
      </section>
    </>
  );
}
