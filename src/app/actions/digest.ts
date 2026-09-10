"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";

// Stored in auth user metadata, where the /api/digest cron reads it. Default is on.
export async function setDigestOptOut(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.auth.updateUser({
    data: { digest_opt_out: formData.get("optOut") === "true" },
  });
  revalidatePath("/more");
}
