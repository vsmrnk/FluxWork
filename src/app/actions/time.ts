"use server";

import { revalidatePath } from "next/cache";
import { track, trackOnce } from "@/lib/analytics";
import { parseTimeInput, resolveEntryTimes } from "@/lib/parseTimeInput";
import { assertWithinLimit } from "@/lib/plan";
import { requireUser, type Supabase } from "@/lib/supabase/server";

/** Where a timer start came from — the `source` prop on `timer_started`. */
type TimerSource = "start_bar" | "task_row" | "first_run";

/** One of the ProjectForm swatches. */
const QUICK_PROJECT_COLOR = "#1f6feb";

/** New entries inherit their task's billability. */
async function taskBillableDefault(supabase: Supabase, taskId: string) {
  const { data } = await supabase
    .from("tasks")
    .select("is_billable")
    .eq("id", taskId)
    .single();
  return data?.is_billable ?? true;
}

async function insertRunningEntry(
  supabase: Supabase,
  userId: string,
  taskId: string,
  source: TimerSource,
) {
  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      user_id: userId,
      task_id: taskId,
      started_at: new Date().toISOString(),
      ended_at: null,
      is_billable: await taskBillableDefault(supabase, taskId),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await track(supabase, "timer_started", { source });
  return { ok: true as const, id: data.id };
}

/** Activation = the user's first completed billable entry. */
async function endEntry(supabase: Supabase, userId: string, entryId: string) {
  const { data, error } = await supabase
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", entryId)
    .is("ended_at", null)
    .select("is_billable")
    .maybeSingle();

  if (error) return { error: error.message };

  if (data?.is_billable) await trackOnce(supabase, userId, "activation");
  return { ok: true as const };
}

async function insertCompletedEntry(
  supabase: Supabase,
  userId: string,
  projectId: string,
  entry: { taskId: string; started: Date; ended: Date; notes: string | null },
) {
  const isBillable = await taskBillableDefault(supabase, entry.taskId);
  const { error } = await supabase.from("time_entries").insert({
    user_id: userId,
    task_id: entry.taskId,
    started_at: entry.started.toISOString(),
    ended_at: entry.ended.toISOString(),
    notes: entry.notes,
    is_billable: isBillable,
  });

  if (error) return { error: error.message };

  if (isBillable) await trackOnce(supabase, userId, "activation");

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  return { ok: true };
}

/**
 * Overlapping timers are allowed by design (concurrent work, like Harvest), so
 * this never stops other entries — switchTimer does stop-and-start. The Start
 * bar is in the app layout, so timer changes revalidate the whole layout.
 */
export async function startTimer(
  taskId: string,
  projectId: string,
  source: TimerSource = "task_row",
) {
  const { supabase, user } = await requireUser();

  const res = await insertRunningEntry(supabase, user.id, taskId, source);
  if ("error" in res) return res;

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/", "layout");
  return res;
}

export async function stopTimer(entryId: string, projectId: string) {
  const { supabase, user } = await requireUser();

  const res = await endEntry(supabase, user.id, entryId);
  if ("error" in res) return res;

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/", "layout");
  return res;
}

/** Stop then start; aborts before starting if the stop fails, so a switch never leaves two timers. */
export async function switchTimer(
  stopEntryId: string,
  taskId: string,
  projectId: string,
) {
  const { supabase, user } = await requireUser();

  const stopped = await endEntry(supabase, user.id, stopEntryId);
  if ("error" in stopped) return stopped;

  const res = await insertRunningEntry(supabase, user.id, taskId, "start_bar");
  if ("error" in res) return res;

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/", "layout");
  return res;
}

/**
 * Creates a task (and a project too when projectId is null), both named from
 * the typed text, then starts it. Passing stopEntryId folds in a switch.
 */
export async function quickStart(
  rawText: string,
  projectId: string | null,
  opts?: { stopEntryId?: string | null; source?: TimerSource },
) {
  const { supabase, user } = await requireUser();

  const name = rawText.trim();
  if (!name) return { error: "Type what you're working on first." };
  if (name.length > 120) return { error: "Keep it under 120 characters." };

  let targetProjectId = projectId;
  if (!targetProjectId) {
    const limitErr = await assertWithinLimit(supabase, "projects");
    if (limitErr) return limitErr;

    const { data: project, error } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name, color: QUICK_PROJECT_COLOR })
      .select("id")
      .single();
    if (error) return { error: error.message };
    targetProjectId = project.id;
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({ user_id: user.id, project_id: targetProjectId, name })
    .select("id")
    .single();
  if (taskError) return { error: taskError.message };

  if (opts?.stopEntryId) {
    const stopped = await endEntry(supabase, user.id, opts.stopEntryId);
    if ("error" in stopped) return stopped;
  }

  const started = await insertRunningEntry(
    supabase,
    user.id,
    task.id,
    opts?.source ?? "start_bar",
  );
  if ("error" in started) return started;

  revalidatePath("/", "layout");
  return { ok: true as const, projectId: targetProjectId, taskId: task.id };
}

export async function addManualEntry(projectId: string, formData: FormData) {
  const { supabase, user } = await requireUser();

  const taskId = String(formData.get("task_id") ?? "");
  const startedAtLocal = String(formData.get("started_at") ?? "");
  const endedAtLocal = String(formData.get("ended_at") ?? "");

  if (!taskId || !startedAtLocal || !endedAtLocal) {
    return { error: "Task, start and end are all required." };
  }

  const started = new Date(startedAtLocal);
  const ended = new Date(endedAtLocal);

  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) {
    return { error: "Invalid start or end time." };
  }
  if (ended < started) {
    return { error: "End time must be after start time." };
  }

  return insertCompletedEntry(supabase, user.id, projectId, {
    taskId,
    started,
    ended,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
}

/**
 * The "Add time" field. Re-parsed here so the entry never trusts
 * client-computed timestamps; `today` is the caller's local date, used only to
 * pick the anchor.
 */
export async function addTimeEntry(projectId: string, formData: FormData) {
  const { supabase, user } = await requireUser();

  const taskId = String(formData.get("task_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const today = String(formData.get("today") ?? "");

  if (!taskId) return { error: "Pick a task first." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a valid date." };

  const parsed = parseTimeInput(String(formData.get("input") ?? ""));
  if (!parsed.ok) return { error: parsed.error };

  const { started, ended } = resolveEntryTimes(parsed, date, date === today);
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) {
    return { error: "Invalid date or time." };
  }
  if (ended <= started) return { error: "The end must be after the start." };

  return insertCompletedEntry(supabase, user.id, projectId, {
    taskId,
    started,
    ended,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
}

/** Saved on its own so a stray blur in the time list can never rewrite timestamps. */
export async function setEntryNotes(
  entryId: string,
  projectId: string,
  notes: string,
) {
  const { supabase } = await requireUser();
  const clean = notes.trim();
  if (clean.length > 500) return { error: "Keep notes under 500 characters." };

  const { error } = await supabase
    .from("time_entries")
    .update({ notes: clean || null })
    .eq("id", entryId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  return { ok: true };
}

/**
 * A blank end keeps the entry running, so a mistakenly stopped timer can be
 * resumed. duration_seconds is a generated column and recomputes itself.
 */
export async function updateEntry(
  entryId: string,
  projectId: string,
  formData: FormData,
) {
  const { supabase } = await requireUser();

  const taskId = String(formData.get("task_id") ?? "").trim();
  const startedAtLocal = String(formData.get("started_at") ?? "").trim();
  const endedAtLocal = String(formData.get("ended_at") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!taskId) return { error: "Pick a task." };
  if (!startedAtLocal) return { error: "A start time is required." };

  const started = new Date(startedAtLocal);
  if (Number.isNaN(started.getTime())) return { error: "Invalid start time." };

  let ended: Date | null = null;
  if (endedAtLocal) {
    ended = new Date(endedAtLocal);
    if (Number.isNaN(ended.getTime())) return { error: "Invalid end time." };
    if (ended <= started) return { error: "The end must be after the start." };
  }

  const { error } = await supabase
    .from("time_entries")
    .update({
      task_id: taskId,
      started_at: started.toISOString(),
      ended_at: ended ? ended.toISOString() : null,
      notes,
    })
    .eq("id", entryId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function setEntryBillable(
  entryId: string,
  projectId: string,
  isBillable: boolean,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("time_entries")
    .update({ is_billable: isBillable })
    .eq("id", entryId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function deleteEntry(entryId: string, projectId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", entryId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  return { ok: true };
}
