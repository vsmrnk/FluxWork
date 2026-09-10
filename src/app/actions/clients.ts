"use server";

import { revalidatePath } from "next/cache";
import { parseRate } from "@/lib/invoice";
import { assertWithinLimit } from "@/lib/plan";
import { requireUser } from "@/lib/supabase/server";

/** Tax percentage 0–100, rounded to match numeric(6,3). Empty means 0. */
function parseTaxRate(raw: FormDataEntryValue | null): { value: number } | { error: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { value: 0 };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return { error: "Tax rate must be between 0 and 100." };
  }
  return { value: Math.round(n * 1000) / 1000 };
}

function readClient(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Client name is required." };

  const rate = parseRate(formData.get("default_rate"));
  if ("error" in rate) return rate;

  const taxRate = parseTaxRate(formData.get("tax_rate"));
  if ("error" in taxRate) return taxRate;

  return {
    fields: {
      name,
      email: String(formData.get("email") ?? "").trim() || null,
      default_rate: rate.value,
      currency: (String(formData.get("currency") ?? "").trim() || "USD").toUpperCase(),
      address: String(formData.get("address") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      tax_label: String(formData.get("tax_label") ?? "").trim() || null,
      tax_rate: taxRate.value,
    },
  };
}

export async function createClient(formData: FormData) {
  const { supabase, user } = await requireUser();

  const limitErr = await assertWithinLimit(supabase, "clients");
  if (limitErr) return limitErr;

  const client = readClient(formData);
  if ("error" in client) return client;

  const { error } = await supabase
    .from("clients")
    .insert({ user_id: user.id, ...client.fields });
  if (error) return { error: error.message };

  revalidatePath("/clients");
  return { ok: true };
}

/**
 * Three-field client creator used where a client is first needed. With a
 * `projectId`, the new client is linked to that project in the same action.
 */
export async function createClientInline(
  formData: FormData,
  projectId?: string | null,
) {
  const { supabase, user } = await requireUser();

  const limitErr = await assertWithinLimit(supabase, "clients");
  if (limitErr) return limitErr;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Client name is required." };

  const rate = parseRate(formData.get("default_rate"));
  if ("error" in rate) return rate;

  const { data, error } = await supabase
    .from("clients")
    .insert({
      user_id: user.id,
      name,
      email: String(formData.get("email") ?? "").trim() || null,
      default_rate: rate.value,
    })
    .select("id, name")
    .single();

  if (error) return { error: error.message };

  if (projectId) {
    const { error: linkErr } = await supabase
      .from("projects")
      .update({ client_id: data.id })
      .eq("id", projectId);
    if (linkErr) return { error: linkErr.message };
    revalidatePath(`/projects/${projectId}`);
  }

  revalidatePath("/clients");
  revalidatePath("/");
  return { ok: true as const, id: data.id, name: data.name };
}

export async function updateClient(clientId: string, formData: FormData) {
  const { supabase } = await requireUser();

  const client = readClient(formData);
  if ("error" in client) return client;

  const { error } = await supabase
    .from("clients")
    .update(client.fields)
    .eq("id", clientId);
  if (error) return { error: error.message };

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export async function setClientArchived(clientId: string, archived: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("clients")
    .update({ is_archived: archived })
    .eq("id", clientId);
  if (error) return { error: error.message };
  revalidatePath("/clients");
  return { ok: true };
}

export async function deleteClient(clientId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) {
    // invoices.client_id is ON DELETE RESTRICT.
    if (error.code === "23503") {
      return { error: "This client has invoices and can't be deleted. Archive it instead." };
    }
    return { error: error.message };
  }
  revalidatePath("/clients");
  return { ok: true };
}
