"use server";

import { revalidatePath } from "next/cache";
import { getPlan } from "@/lib/plan";
import { requireUser, type Supabase } from "@/lib/supabase/server";

const MAX_NAME = 120;

/** Project page always; Today too when totals or names change. */
function refresh(projectId: string, alsoHome = false) {
  revalidatePath(`/projects/${projectId}`);
  if (alsoHome) revalidatePath("/");
}

function nameError(name: string) {
  if (!name) return "Task name is required.";
  if (name.length > MAX_NAME) return "Keep it under 120 characters.";
  return null;
}

// Not exported: parentId must only reach the insert through createSubtask's Pro check.
async function insertTask(
  supabase: Supabase,
  userId: string,
  projectId: string,
  parentId: string | null,
  formData: FormData,
) {
  const name = String(formData.get("name") ?? "").trim();
  const invalid = nameError(name);
  if (invalid) return { error: invalid };

  // Append to the end of the sibling group.
  let last = supabase
    .from("tasks")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1);
  last = parentId === null ? last.is("parent_id", null) : last.eq("parent_id", parentId);
  const { data } = await last.maybeSingle();

  const { error } = await supabase.from("tasks").insert({
    user_id: userId,
    project_id: projectId,
    parent_id: parentId,
    name,
    sort_order: (data?.sort_order ?? -1) + 1,
  });
  if (error) return { error: error.message };

  refresh(projectId, true);
  return { ok: true };
}

export async function createTask(projectId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  return insertTask(supabase, user.id, projectId, null, formData);
}

export async function createSubtask(
  projectId: string,
  parentId: string,
  formData: FormData,
) {
  const { supabase, user } = await requireUser();
  const plan = await getPlan(supabase);
  if (!plan.canUseAdvanced) {
    return { error: "Subtasks are a Pro feature. Upgrade on the Plan page." };
  }
  const { data: parent } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("id", parentId)
    .maybeSingle();
  if (parent?.project_id !== projectId) {
    return { error: "That parent task is no longer available." };
  }
  return insertTask(supabase, user.id, projectId, parentId, formData);
}

/** New time entries inherit this as their default; existing entries keep theirs. */
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
  const invalid = nameError(name);
  if (invalid) return { error: invalid };

  const { error } = await supabase
    .from("tasks")
    .update({ name })
    .eq("id", taskId)
    .eq("project_id", projectId);
  if (error) return { error: error.message };

  refresh(projectId, true);
  return { ok: true };
}

export async function deleteTask(taskId: string, projectId: string) {
  const { supabase } = await requireUser();
  // Subtasks cascade via the parent_id FK.
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("project_id", projectId);
  if (error) return { error: error.message };
  refresh(projectId, true);
  return { ok: true };
}
