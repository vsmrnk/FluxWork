"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/plan";
import { parseTimeInput } from "@/lib/parseTimeInput";

/* ------------------------------------------------------------------ *
 * Shared vocabulary. Kept local (a "use server" module may only export
 * async functions) — the client-side twins live in TaskModel.ts.
 * ------------------------------------------------------------------ */
const STATUSES = ["open", "in_progress", "done"] as const;
type Status = (typeof STATUSES)[number];
const PRIORITIES = ["low", "normal", "high"] as const;
type Priority = (typeof PRIORITIES)[number];

const MAX_ESTIMATE_SECONDS = 9999 * 3600;
const MAX_DESCRIPTION = 4000;
const MAX_NAME = 120;
/** Deep enough for real work breakdowns, shallow enough to stay readable. */
const MAX_DEPTH = 6;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Project page always; the Today dashboard only when totals/labels move. */
function refresh(projectId: string, alsoHome = false) {
  revalidatePath(`/projects/${projectId}`);
  if (alsoHome) revalidatePath("/");
}

function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/**
 * "2h" / "1:30" / "90m" → seconds. Empty clears the estimate. Clock ranges
 * ("9-11") are rejected here: an estimate is a length, not a slot.
 */
function readEstimate(raw: FormDataEntryValue | null): { seconds: number | null } | { error: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { seconds: null };
  const parsed = parseTimeInput(s);
  if (!parsed.ok) return { error: parsed.error };
  if (parsed.range) {
    return { error: "Enter a length like 2h, 90m or 1:30 — not a time range." };
  }
  if (parsed.seconds > MAX_ESTIMATE_SECONDS) {
    return { error: "That estimate is too large." };
  }
  return { seconds: Math.round(parsed.seconds) };
}

function readDueDate(raw: FormDataEntryValue | null): { value: string | null } | { error: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    return { error: "Use a due date like 2026-08-14." };
  }
  return { value: s };
}

function readPriority(raw: FormDataEntryValue | null): { value: Priority | null } | { error: string } {
  const s = String(raw ?? "").trim();
  if (!s || s === "none") return { value: null };
  if (!(PRIORITIES as readonly string[]).includes(s)) {
    return { error: "Pick a priority of low, normal or high." };
  }
  return { value: s as Priority };
}

function readDescription(raw: FormDataEntryValue | null): { value: string | null } | { error: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { value: null };
  if (s.length > MAX_DESCRIPTION) {
    return { error: `Keep the description under ${MAX_DESCRIPTION} characters.` };
  }
  return { value: s };
}

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */

/** Next free slot at the end of a sibling group, so new tasks append. */
async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  projectId: string,
  parentId: string | null,
) {
  let q = supabase
    .from("tasks")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1);
  q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
  const { data } = await q.maybeSingle();
  return (data?.sort_order ?? -1) + 1;
}

export async function createTask(
  projectId: string,
  formData: FormData,
  parentId: string | null = null,
) {
  const { supabase, user } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Task name is required." };
  if (name.length > MAX_NAME) return { error: "Keep it under 120 characters." };

  // Optional detail — the quick-add form sends only a name.
  const estimate = readEstimate(formData.get("estimate"));
  if ("error" in estimate) return { error: estimate.error };
  const due = readDueDate(formData.get("due_date"));
  if ("error" in due) return { error: due.error };
  const priority = readPriority(formData.get("priority"));
  if ("error" in priority) return { error: priority.error };
  const description = readDescription(formData.get("description"));
  if ("error" in description) return { error: description.error };

  const sortOrder = await nextSortOrder(supabase, projectId, parentId);

  const { error } = await supabase.from("tasks").insert({
    user_id: user.id,
    project_id: projectId,
    parent_id: parentId,
    name,
    sort_order: sortOrder,
    estimate_seconds: estimate.seconds,
    due_date: due.value,
    priority: priority.value,
    description: description.value,
  });

  if (error) return { error: error.message };

  refresh(projectId, true);
  return { ok: true };
}

export async function createSubtask(
  projectId: string,
  parentId: string,
  formData: FormData,
) {
  // Subtasks are Pro-only. Enforce here — hiding the UI is not enforcement.
  const { supabase } = await requireUser();
  const plan = await getPlan(supabase);
  if (!plan.canUseAdvanced) {
    return { error: "Subtasks are a Pro feature. Upgrade on the Plan page." };
  }
  const { data: parent } = await supabase
    .from("tasks")
    .select("id, project_id")
    .eq("id", parentId)
    .maybeSingle();
  if (!parent || parent.project_id !== projectId) {
    return { error: "That parent task is no longer available." };
  }
  return createTask(projectId, formData, parentId);
}

/* ------------------------------------------------------------------ *
 * Edit
 * ------------------------------------------------------------------ */

/**
 * Toggle a task's billability. New time entries inherit this as their default
 * (see startTimer / addManualEntry); existing entries keep their own flag.
 */
export async function setTaskBillable(
  taskId: string,
  projectId: string,
  isBillable: boolean,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("tasks")
    .update({ is_billable: isBillable })
    .eq("id", taskId)
    .eq("project_id", projectId);
  if (error) return { error: error.message };
  refresh(projectId);
  return { ok: true };
}

export async function renameTask(
  taskId: string,
  projectId: string,
  formData: FormData,
) {
  const { supabase } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Task name is required." };
  if (name.length > MAX_NAME) return { error: "Keep it under 120 characters." };

  const { error } = await supabase
    .from("tasks")
    .update({ name })
    .eq("id", taskId)
    .eq("project_id", projectId);
  if (error) return { error: error.message };

  refresh(projectId, true);
  return { ok: true };
}

/**
 * The task detail form: name, description, estimate, due date, priority and
 * status in one submit. Status still propagates through the tree.
 */
export async function updateTaskDetails(
  taskId: string,
  projectId: string,
  formData: FormData,
) {
  const { supabase } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Task name is required." };
  if (name.length > MAX_NAME) return { error: "Keep it under 120 characters." };

  const description = readDescription(formData.get("description"));
  if ("error" in description) return { error: description.error };
  const estimate = readEstimate(formData.get("estimate"));
  if ("error" in estimate) return { error: estimate.error };
  const due = readDueDate(formData.get("due_date"));
  if ("error" in due) return { error: due.error };
  const priority = readPriority(formData.get("priority"));
  if ("error" in priority) return { error: priority.error };

  const rawStatus = String(formData.get("status") ?? "").trim();
  const status: Status | null = isStatus(rawStatus) ? rawStatus : null;
  if (rawStatus && !status) return { error: "Pick a status of open, in progress or done." };

  const { data: current } = await supabase
    .from("tasks")
    .select("id, status, project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!current || current.project_id !== projectId) {
    return { error: "That task is no longer available." };
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      name,
      description: description.value,
      estimate_seconds: estimate.seconds,
      due_date: due.value,
      priority: priority.value,
    })
    .eq("id", taskId)
    .eq("project_id", projectId);
  if (error) return { error: error.message };

  if (status && status !== current.status) {
    const res = await writeStatuses(supabase, projectId, new Map([[taskId, status]]));
    if (res?.error) return res;
  }

  refresh(projectId, true);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Status + completion propagation
 * ------------------------------------------------------------------ */

type StatusRow = { id: string; parent_id: string | null; status: string };

/**
 * Completion flows through the tree in both directions:
 *  · finishing a parent finishes everything under it;
 *  · finishing the last open sibling finishes the parent too;
 *  · reopening anything reopens its finished ancestors (as "in progress",
 *    because the branch is demonstrably not done).
 */
function propagate(rows: StatusRow[], targets: Map<string, Status>): Map<string, Status> {
  const next = new Map<string, Status>(
    rows.map((r) => [r.id, (isStatus(r.status) ? r.status : "open") as Status]),
  );
  const parentOf = new Map<string, string | null>(rows.map((r) => [r.id, r.parent_id]));
  const kids = new Map<string | null, string[]>();
  for (const r of rows) {
    const bucket = kids.get(r.parent_id) ?? [];
    bucket.push(r.id);
    kids.set(r.parent_id, bucket);
  }

  // Downward pass: a finished parent finishes its whole subtree.
  for (const [id, status] of targets) {
    if (!next.has(id)) continue;
    next.set(id, status);
    if (status !== "done") continue;
    const stack = [...(kids.get(id) ?? [])];
    while (stack.length) {
      const child = stack.pop() as string;
      next.set(child, "done");
      stack.push(...(kids.get(child) ?? []));
    }
  }

  // Upward pass: roll completion up, or reopen finished ancestors.
  for (const [id, status] of targets) {
    let parent = parentOf.get(id) ?? null;
    while (parent) {
      if (status === "done") {
        const siblings = kids.get(parent) ?? [];
        if (siblings.length === 0 || !siblings.every((c) => next.get(c) === "done")) break;
        next.set(parent, "done");
      } else {
        if (next.get(parent) !== "done") break;
        next.set(parent, "in_progress");
      }
      parent = parentOf.get(parent) ?? null;
    }
  }

  return next;
}

async function writeStatuses(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  projectId: string,
  targets: Map<string, Status>,
) {
  const { data: rows, error: readError } = await supabase
    .from("tasks")
    .select("id, parent_id, status")
    .eq("project_id", projectId);
  if (readError) return { error: readError.message };

  const all = (rows ?? []) as StatusRow[];
  for (const id of targets.keys()) {
    if (!all.some((r) => r.id === id)) {
      return { error: "That task is no longer available." };
    }
  }

  const next = propagate(all, targets);
  const completedAt = new Date().toISOString();

  const changed = all.filter((r) => next.get(r.id) !== r.status);
  if (changed.length === 0) return { ok: true as const };

  const results = await Promise.all(
    changed.map((r) => {
      const status = next.get(r.id) as Status;
      return supabase
        .from("tasks")
        .update({
          status,
          completed_at: status === "done" ? completedAt : null,
        })
        .eq("id", r.id)
        .eq("project_id", projectId);
    }),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  return { ok: true as const };
}

export async function setTaskStatus(
  taskId: string,
  projectId: string,
  status: string,
) {
  if (!isStatus(status)) return { error: "Unknown status." };
  const { supabase } = await requireUser();
  const res = await writeStatuses(supabase, projectId, new Map([[taskId, status]]));
  if (res?.error) return res;
  refresh(projectId, true);
  return { ok: true };
}

/** Bulk status from the selection bar. Propagation runs once for the whole set. */
export async function setTasksStatus(
  projectId: string,
  taskIds: string[],
  status: string,
) {
  if (!isStatus(status)) return { error: "Unknown status." };
  if (!Array.isArray(taskIds) || taskIds.length === 0) return { ok: true };
  if (taskIds.length > 500) return { error: "Too many tasks selected." };
  const { supabase } = await requireUser();
  const targets = new Map<string, Status>(taskIds.map((id) => [String(id), status]));
  const res = await writeStatuses(supabase, projectId, targets);
  if (res?.error) return res;
  refresh(projectId, true);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Ordering + nesting
 * ------------------------------------------------------------------ */

/**
 * Persist a drag, an Alt+arrow move, or an indent/outdent. The client sends
 * only the rows whose parent or position actually changed.
 */
export async function reorderTasks(
  projectId: string,
  moves: { id: string; parentId: string | null; sortOrder: number }[],
) {
  if (!Array.isArray(moves) || moves.length === 0) return { ok: true };
  if (moves.length > 500) return { error: "Too many tasks to reorder at once." };

  const { supabase } = await requireUser();

  const { data: rows, error: readError } = await supabase
    .from("tasks")
    .select("id, parent_id")
    .eq("project_id", projectId);
  if (readError) return { error: readError.message };

  const current = new Map<string, string | null>(
    (rows ?? []).map((r) => [r.id, r.parent_id]),
  );

  for (const move of moves) {
    if (typeof move?.id !== "string" || !current.has(move.id)) {
      return { error: "That task is no longer available." };
    }
    if (move.parentId !== null) {
      if (typeof move.parentId !== "string" || !current.has(move.parentId)) {
        return { error: "That parent task is no longer available." };
      }
    }
    if (!Number.isInteger(move.sortOrder) || move.sortOrder < 0 || move.sortOrder > 100000) {
      return { error: "Invalid task position." };
    }
  }

  const proposed = new Map(current);
  for (const move of moves) proposed.set(move.id, move.parentId);

  // Nesting a task under another *is* creating a subtask, so it carries the
  // same Pro gate as createSubtask. Pure sibling reordering stays free.
  const nests = moves.some(
    (m) => m.parentId !== null && current.get(m.id) !== m.parentId,
  );
  if (nests) {
    const plan = await getPlan(supabase);
    if (!plan.canUseAdvanced) {
      return { error: "Subtasks are a Pro feature. Upgrade on the Plan page." };
    }
  }

  for (const id of proposed.keys()) {
    let hops = 0;
    let parent = proposed.get(id) ?? null;
    while (parent) {
      if (parent === id) return { error: "A task can't sit inside itself." };
      if (++hops > MAX_DEPTH) return { error: "Tasks can only nest a few levels deep." };
      parent = proposed.get(parent) ?? null;
    }
  }

  const results = await Promise.all(
    moves.map((m) =>
      supabase
        .from("tasks")
        .update({ parent_id: m.parentId, sort_order: m.sortOrder })
        .eq("id", m.id)
        .eq("project_id", projectId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  refresh(projectId);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Delete
 * ------------------------------------------------------------------ */

export async function deleteTask(taskId: string, projectId: string) {
  const { supabase } = await requireUser();
  // Child subtasks cascade automatically via the parent_id FK.
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("project_id", projectId);
  if (error) return { error: error.message };
  refresh(projectId, true);
  return { ok: true };
}

export async function deleteTasks(projectId: string, taskIds: string[]) {
  if (!Array.isArray(taskIds) || taskIds.length === 0) return { ok: true };
  if (taskIds.length > 500) return { error: "Too many tasks selected." };
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("tasks")
    .delete()
    .in("id", taskIds.map(String))
    .eq("project_id", projectId);
  if (error) return { error: error.message };
  refresh(projectId, true);
  return { ok: true };
}
