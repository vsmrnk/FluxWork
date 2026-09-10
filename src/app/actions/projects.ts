"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseRate } from "@/lib/invoice";
import { assertWithinLimit } from "@/lib/plan";
import { requireUser } from "@/lib/supabase/server";

export async function createProject(formData: FormData) {
  const { supabase, user } = await requireUser();

  const limitErr = await assertWithinLimit(supabase, "projects");
  if (limitErr) return limitErr;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Project name is required." };

  const rate = parseRate(formData.get("rate"));
  if ("error" in rate) return rate;

  const { error } = await supabase.from("projects").insert({
    user_id: user.id,
    name,
    client_id: String(formData.get("client_id") ?? "").trim() || null,
    rate: rate.value,
    code: String(formData.get("code") ?? "").trim() || null,
    color: String(formData.get("color") ?? "").trim() || "#111111",
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  return { ok: true };
}

/** A null `rate` inherits the client's default_rate; a null `clientId` detaches it. */
export async function updateProjectBilling(
  projectId: string,
  clientId: string | null,
  formData: FormData,
) {
  const { supabase } = await requireUser();

  const rate = parseRate(formData.get("rate"));
  if ("error" in rate) return rate;

  const { error } = await supabase
    .from("projects")
    .update({ client_id: clientId, rate: rate.value })
    .eq("id", projectId);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function setProjectArchived(projectId: string, archived: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("projects")
    .update({ is_archived: archived })
    .eq("id", projectId);
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function deleteProject(projectId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) return { error: error.message };
  revalidatePath("/");
  redirect("/");
}
