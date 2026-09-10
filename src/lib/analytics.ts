import type { Json } from "@/lib/database.types";
import type { Supabase } from "@/lib/supabase/server";

// Insert errors are deliberately ignored: tracking must never break a user flow.

type FunnelEvent = "signup" | "activation" | "invoice_generated" | "upgrade";

export async function track(
  supabase: Supabase,
  event: FunnelEvent | "timer_started",
  props?: Json,
) {
  await supabase.from("analytics_events").insert({ event, props: props ?? null });
}

/** Records `event` only if this user has never had it (e.g. first billable entry). */
export async function trackOnce(
  supabase: Supabase,
  userId: string,
  event: FunnelEvent,
  props?: Json,
) {
  const { count } = await supabase
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event", event);
  if (count) return;
  await supabase
    .from("analytics_events")
    .insert({ user_id: userId, event, props: props ?? null });
}
