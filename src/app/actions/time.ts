"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { track, trackOnce } from "@/lib/analytics";
import { assertWithinLimit } from "@/lib/plan";
import { parseTimeInput, resolveEntryTimes } from "@/lib/parseTimeInput";

/** Where a timer start came from — funnel property on `timer_started` (§11). */
export type TimerSource = "start_bar" | "task_row" | "first_run";

/** Default color for projects auto-created via quickStart (from the ProjectForm swatches). */
const QUICK_PROJECT_COLOR = "#1f6feb";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

type Supa = Awaited<ReturnType<typeof createClient>>;
type AuthedUser = { id: string };

/** Single insert path for every timer start; also emits `timer_started`. */
async function insertRunningEntry(
  supabase: Supa,
  user: AuthedUser,
  taskId: string,
  source: TimerSource,
) {
  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      user_id: user.id,
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

/** Single close path for every timer stop; fires `activation` on the first billable entry. */
async function endEntry(supabase: Supa, user: AuthedUser, entryId: string) {
  const { data, error } = await supabase
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", entryId)
    .is("ended_at", null) // only stop if still running
    .select("is_billable")
    .maybeSingle();

  if (error) return { error: error.message };

  // Funnel: activation = the user's first completed billable entry.
  if (data?.is_billable) await trackOnce(supabase, user.id, "activation");
  return { ok: true as const };
}

/** Look up a task's billability so new entries inherit it as their default. */
async function taskBillableDefault(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("tasks")
    .select("is_billable")
    .eq("id", taskId)
    .single();
  return data?.is_billable ?? true;
}

/**
 * Start a timer for a task. Overlapping running timers are permitted by design
 * (mirrors Harvest's ability to track concurrent work), so we do not stop other
 * running entries here — use switchTimer for stop-and-start.
 *
 * The Start bar lives in the app layout on every screen, so timer mutations
 * revalidate the whole layout, not just the page they happened on.
 */
export async function startTimer(
  taskId: string,
  projectId: string,
  source: TimerSource = "task_row",
) {
  const { supabase, user } = await requireUser();

  const res = await insertRunningEntry(supabase, user, taskId, source);
  if ("error" in res) return res;

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/", "layout");
  return res;
}

export async function stopTimer(entryId: string, projectId: string) {
  const { supabase, user } = await requireUser();

  const res = await endEntry(supabase, user, entryId);
  if ("error" in res) return res;

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/", "layout");
  return res;
}

/**
 * Switch work in one action: stop the running entry, then start the picked
 * task (quick-picker's tap-to-switch). Aborts before starting if the stop
 * fails, so the user never ends up with two timers from a switch.
 */
export async function switchTimer(
  stopEntryId: string,
  taskId: string,
  projectId: string,
) {
  const { supabase, user } = await requireUser();

  const stopped = await endEntry(supabase, user, stopEntryId);
  if ("error" in stopped) return stopped;

  const res = await insertRunningEntry(supabase, user, taskId, "start_bar");
  if ("error" in res) return res;

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/", "layout");
  return res;
}

/**
 * One-shot create-and-track (quick-picker inline create + first-run card):
 * create the task — and the project too when projectId is null, both named
 * from the typed text, renameable later — then start the timer with the same
 * semantics as startTimer. Passing stopEntryId folds in a switch.
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
    // Same free-tier ceiling as the regular project form.
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
    const stopped = await endEntry(supabase, user, opts.stopEntryId);
    if ("error" in stopped) return stopped;
  }

  const started = await insertRunningEntry(
    supabase,
    user,
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
  const notes = String(formData.get("notes") ?? "").trim() || null;

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

  const isBillable = await taskBillableDefault(supabase, taskId);
  const { error } = await supabase.from("time_entries").insert({
    user_id: user.id,
    task_id: taskId,
    started_at: started.toISOString(),
    ended_at: ended.toISOString(),
    notes,
    is_billable: isBillable,
  });

  if (error) return { error: error.message };

  // Funnel: activation = the user's first completed billable entry.
  if (isBillable) await trackOnce(supabase, user.id, "activation");

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  return { ok: true };
}

/**
 * "Add time" smart field (plan §6 Flow 3): one text input parsed to a duration
 * or a clock range, plus the chosen day. The client parses for instant feedback;
 * we re-parse and re-validate here so the entry never trusts client-computed
 * timestamps. `today` is the caller's local date, used only to pick the anchor.
 */
export async function addTimeEntry(projectId: string, formData: FormData) {
  const { supabase, user } = await requireUser();

  const taskId = String(formData.get("task_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const today = String(formData.get("today") ?? "");
  const input = String(formData.get("input") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!taskId) return { error: "Pick a task first." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a valid date." };

  const parsed = parseTimeInput(input);
  if (!parsed.ok) return { error: parsed.error };

  const { started, ended } = resolveEntryTimes(parsed, date, date === today);
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) {
    return { error: "Invalid date or time." };
  }
  if (ended <= started) return { error: "The end must be after the start." };

  const isBillable = await taskBillableDefault(supabase, taskId);
  const { error } = await supabase.from("time_entries").insert({
    user_id: user.id,
    task_id: taskId,
    started_at: started.toISOString(),
    ended_at: ended.toISOString(),
    notes,
    is_billable: isBillable,
  });

  if (error) return { error: error.message };

  // Funnel: activation = the user's first completed billable entry.
  if (isBillable) await trackOnce(supabase, user.id, "activation");

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  return { ok: true };
}

/**
 * "What was done" — the note on a single entry. Kept separate from updateEntry
 * so the time view can save a note inline without round-tripping the whole
 * timestamp form (and without letting a stray blur rewrite the times).
 */
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
 * Full correction of one entry: which task it belongs to, its start/end, and
 * its note. Leaving the end blank keeps the entry running, so a mistakenly
 * stopped timer can be resumed rather than re-created. `duration_seconds` is a
 * generated column, so it recomputes from the new timestamps automatically.
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

/** Override billability on a single entry (independent of the task default). */
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
