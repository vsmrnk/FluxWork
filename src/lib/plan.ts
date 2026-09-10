import type { Supabase } from "@/lib/supabase/server";

const FREE_LIMITS = { clients: 5, projects: 5 };

type Plan = {
  tier: "free" | "paid";
  /** Raw subscription status: 'free' | 'active' | 'past_due' | 'canceled'. */
  status: string;
  limits: { clients: number; projects: number };
  canInvoice: boolean;
  canExport: boolean;
  /** Subtasks and custom invoice templates. */
  canUseAdvanced: boolean;
};

const PAID_PLAN: Plan = {
  tier: "paid",
  status: "active",
  limits: { clients: Infinity, projects: Infinity },
  canInvoice: true,
  canExport: true,
  canUseAdvanced: true,
};

/**
 * Only an 'active' subscription unlocks Pro; 'past_due' and 'canceled' fall
 * back to free. RLS scopes the row to the caller.
 */
export async function getPlan(supabase: Supabase): Promise<Plan> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status")
    .maybeSingle();

  const status = data?.status ?? "free";
  if (status === "active") return PAID_PLAN;

  return {
    tier: "free",
    status,
    limits: FREE_LIMITS,
    canInvoice: false,
    canExport: false,
    canUseAdvanced: false,
  };
}

/** Counts include archived rows so they match assertWithinLimit exactly. */
export async function getPlanUsage(supabase: Supabase) {
  const plan = await getPlan(supabase);
  const [{ count: clients }, { count: projects }] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }),
  ]);

  return {
    tier: plan.tier,
    status: plan.status,
    clients: { used: clients ?? 0, limit: plan.limits.clients },
    projects: { used: projects ?? 0, limit: plan.limits.projects },
    canInvoice: plan.canInvoice,
  };
}

export async function assertWithinLimit(
  supabase: Supabase,
  resource: "clients" | "projects",
): Promise<{ error: string } | null> {
  const plan = await getPlan(supabase);
  const limit = plan.limits[resource];
  if (!Number.isFinite(limit)) return null;

  const { count } = await supabase
    .from(resource)
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) >= limit) {
    return {
      error: `Free plan is limited to ${limit} ${resource}. Upgrade for unlimited.`,
    };
  }
  return null;
}
