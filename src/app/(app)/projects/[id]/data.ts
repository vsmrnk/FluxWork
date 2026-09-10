import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { TaskNode } from "@/components/TaskTree";
import type { Task } from "@/lib/database.types";

/**
 * The project's tasks as a tree with logged and running time. Cached per
 * request: the page header and every panel read it, but it is fetched once.
 */
export const getTaskTree = cache(async (projectId: string) => {
  const supabase = await createClient();

  const [{ data: tasks }, { data: rollups }, { data: running }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("task_rollups")
        .select("task_id, total_seconds")
        .eq("project_id", projectId),
      supabase
        .from("time_entries")
        .select("id, task_id, started_at, tasks!inner(project_id)")
        .eq("tasks.project_id", projectId)
        .is("ended_at", null),
    ]);

  const loggedByTask = new Map<string, number>();
  for (const r of rollups ?? []) {
    if (r.task_id) loggedByTask.set(r.task_id, r.total_seconds ?? 0);
  }
  const runningByTask = new Map<string, { id: string; started_at: string }>();
  for (const e of running ?? []) {
    if (!runningByTask.has(e.task_id)) {
      runningByTask.set(e.task_id, { id: e.id, started_at: e.started_at });
    }
  }

  const childrenOf = new Map<string | null, Task[]>();
  for (const t of tasks ?? []) {
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

  return {
    tasks: tasks ?? [],
    tree: (childrenOf.get(null) ?? []).map(buildNode),
    runningCount: running?.length ?? 0,
  };
});
