import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlanUsage } from "@/lib/plan";
import { PlanMeter, PlanFeature } from "@/components/PlanMeter";
import { UpgradeButton } from "@/components/UpgradeButton";

const STATUS_LABEL: Record<string, string> = {
  free: "Free",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [usage, { data: sub }] = await Promise.all([
    getPlanUsage(supabase),
    supabase
      .from("subscriptions")
      .select("status, plan, current_period_end")
      .maybeSingle(),
  ]);

  const paid = usage.tier === "paid";
  const status = sub?.status ?? usage.status;
  const portalUrl = process.env.NEXT_PUBLIC_PADDLE_CUSTOMER_PORTAL_URL;

  const proFeatures = [
    "Unlimited clients and projects",
    "Generate invoices from your DOCX templates",
    "CSV / data exports",
    "Billable vs non-billable split & earnings",
  ];

  return (
    <div className="page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
        <p className="text-sm text-ink-2 mt-1">Your plan and the limits it sets.</p>
      </div>

      {/* Current plan */}
      <div className="panel p-5 flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-1">
          <span className="label">Current plan</span>
          <span className="text-xl font-semibold">
            {paid ? "Pro" : "Free"}
            <span className="text-sm font-normal text-ink-3 ml-2">
              ({STATUS_LABEL[status] ?? status})
            </span>
          </span>
        </div>
        {paid && sub?.current_period_end && (
          <div className="flex flex-col gap-1">
            <span className="label">Renews</span>
            <span className="num text-sm text-ink-2">
              {formatDate(sub.current_period_end)}
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {paid ? (
            portalUrl ? (
              <a className="btn" href={portalUrl} target="_blank" rel="noreferrer">
                Manage plan
              </a>
            ) : (
              <span className="text-xs text-ink-3 max-w-xs text-right">
                Manage or cancel from the link in your Paddle receipt emails.
              </span>
            )
          ) : (
            <UpgradeButton email={user.email ?? null} userId={user.id} />
          )}
        </div>
      </div>

      {status === "past_due" && (
        <div className="panel p-4 border-line-strong">
          <p className="text-sm text-ink-2">
            Your last payment failed, so Pro features are paused. Update your
            payment method from your Paddle receipt to restore access.
          </p>
        </div>
      )}

      {/* Usage — the ceilings shown before they're hit (plan §9) */}
      <div className="panel p-5 flex flex-col gap-4">
        <span className="label">Usage</span>
        <PlanMeter
          label="Clients"
          used={usage.clients.used}
          limit={usage.clients.limit}
        />
        <PlanMeter
          label="Projects"
          used={usage.projects.used}
          limit={usage.projects.limit}
        />
        <PlanFeature label="Invoicing" unlocked={usage.canInvoice} />
        <PlanFeature label="Subtasks" unlocked={paid} />
        <PlanFeature label="Custom invoice templates" unlocked={paid} />
      </div>

      {/* What Pro unlocks */}
      <div className="panel p-5">
        <span className="label">
          {paid ? "Included in your plan" : "Upgrade to unlock"}
        </span>
        {!paid && (
          <p className="text-sm text-ink-2 mt-2">
            Upgrade to Pro to send invoices, export your data, and remove the
            client and project limits.
          </p>
        )}
        <ul className="mt-3 flex flex-col gap-2">
          {proFeatures.map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-sm">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-[2px] bg-accent inline-block"
              />
              <span className={paid ? "" : "text-ink-2"}>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
