"use server";

import { revalidatePath } from "next/cache";
import { detectPlaceholders, DOCX_MIME } from "@/lib/docx";
import { getPlan } from "@/lib/plan";
import { requireUser } from "@/lib/supabase/server";

const PRO_ONLY =
  "Custom invoice templates are a Pro feature. Upgrade on the Plan page.";

const BUCKET = "invoice-templates";
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadTemplate(formData: FormData) {
  const { supabase, user } = await requireUser();

  const plan = await getPlan(supabase);
  if (!plan.canUseAdvanced) return { error: PRO_ONLY };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a .docx file to upload." };
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return { error: "Template must be a Word .docx file." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "File is too large (max 5 MB)." };
  }

  const name =
    String(formData.get("name") ?? "").trim() ||
    file.name.replace(/\.docx$/i, "");

  const buffer = Buffer.from(await file.arrayBuffer());

  let placeholders: string[] = [];
  try {
    placeholders = detectPlaceholders(buffer);
  } catch {
    // Display-only metadata; a file it can't parse still uploads.
  }

  const path = `${user.id}/${crypto.randomUUID()}.docx`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: DOCX_MIME, upsert: false });
  if (upErr) return { error: upErr.message };

  const { error } = await supabase.from("invoice_templates").insert({
    user_id: user.id,
    name,
    storage_path: path,
    original_filename: file.name,
    placeholders,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: error.message };
  }

  revalidatePath("/invoices");
  return { ok: true };
}

export async function setDefaultTemplate(templateId: string) {
  const { supabase, user } = await requireUser();

  const plan = await getPlan(supabase);
  if (!plan.canUseAdvanced) return { error: PRO_ONLY };

  const { error: clearErr } = await supabase
    .from("invoice_templates")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("is_default", true);
  if (clearErr) return { error: clearErr.message };

  const { error } = await supabase
    .from("invoice_templates")
    .update({ is_default: true })
    .eq("id", templateId);
  if (error) return { error: error.message };

  revalidatePath("/invoices");
  return { ok: true };
}

export async function deleteTemplate(templateId: string) {
  const { supabase } = await requireUser();

  const { data: tmpl } = await supabase
    .from("invoice_templates")
    .select("storage_path")
    .eq("id", templateId)
    .maybeSingle();

  const { error } = await supabase
    .from("invoice_templates")
    .delete()
    .eq("id", templateId);
  if (error) return { error: error.message };

  if (tmpl?.storage_path) {
    await supabase.storage.from(BUCKET).remove([tmpl.storage_path]);
  }

  revalidatePath("/invoices");
  return { ok: true };
}
