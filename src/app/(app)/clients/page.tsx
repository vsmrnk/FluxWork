import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClientForm } from "@/components/ClientForm";
import { PlanMeter } from "@/components/PlanMeter";
import { formatMoney, listUnbilledClients } from "@/lib/invoice";
import { getPlanUsage } from "@/lib/plan";

function relativeDate(iso: string | null): string {
  if (!iso) return "No activity";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(iso),
  );
}

export default async function ClientsPage() {
  const supabase = await createClient();

  const [
    { data: clients },
    { data: projects },
    { data: rollups },
    unbilled,
    usage,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .order("is_archived", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("projects").select("id, client_id, rate, is_archived"),
    supabase.from("task_rollups").select("project_id, last_tracked_at"),
    listUnbilledClients(supabase),
    getPlanUsage(supabase),
  ]);

  // Heads-up from one below the free ceiling.
  const nearClientLimit =
    usage.tier === "free" &&
    Number.isFinite(usage.clients.limit) &&
    usage.clients.used >= usage.clients.limit - 1;

  const list = clients ?? [];

  // project → client, plus active-project counts
  const projClient = new Map<string, string | null>();
  const activeByClient = new Map<string, number>();
  for (const p of projects ?? []) {
    projClient.set(p.id, p.client_id);
    if (p.client_id && !p.is_archived) {
      activeByClient.set(p.client_id, (activeByClient.get(p.client_id) ?? 0) + 1);
    }
  }

  const unbilledByClient = new Map(unbilled.map((c) => [c.id, c.amount]));

  // last activity per client (max across its projects)
  const lastByClient = new Map<string, string>();
  for (const r of rollups ?? []) {
    if (!r.project_id || !r.last_tracked_at) continue;
    const clientId = projClient.get(r.project_id);
    if (!clientId) continue;
    const prev = lastByClient.get(clientId);
    if (!prev || r.last_tracked_at > prev) lastByClient.set(clientId, r.last_tracked_at);
  }

  const totalUnbilled = unbilled.reduce((sum, c) => sum + c.amount, 0);
  const cur = unbilled[0]?.currency ?? "USD";

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-ink-2 mt-1">
            Who you bill — and what’s waiting to be invoiced.
          </p>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          {nearClientLimit && (
            <PlanMeter
              variant="inline"
              label="clients"
              used={usage.clients.used}
              limit={usage.clients.limit}
            />
          )}
          <ClientForm mode="create" />
        </div>
      </div>

      {list.length > 0 && (
        <div className="panel p-4 flex items-center gap-3">
          <span className="h-1.5 w-1.5 rounded-[2px] bg-gold inline-block" />
          <span className="label">Total unbilled</span>
          <span className="num text-xl text-gold ml-auto">
            {formatMoney(totalUnbilled, cur)}
          </span>
        </div>
      )}

      {list.length === 0 ? (
        <div className="panel py-16 px-6 text-center">
          <p className="font-medium mb-1">No clients yet</p>
          <p className="text-sm text-ink-2 mb-5">
            Add a client with a default hourly rate, then link projects to it.
          </p>
          <div className="inline-flex"><ClientForm mode="create" /></div>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left label font-semibold px-4 py-3 rule-b">Client</th>
                <th className="text-right label font-semibold px-4 py-3 rule-b">Unbilled</th>
                <th className="text-right label font-semibold px-4 py-3 rule-b">Rate</th>
                <th className="text-center label font-semibold px-4 py-3 rule-b">Projects</th>
                <th className="text-right label font-semibold px-4 py-3 rule-b">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const unbilledAmt = unbilledByClient.get(c.id) ?? 0;
                return (
                  <tr key={c.id} className="rule-b last:border-b-0 hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3.5">
                      <Link href={`/clients/${c.id}`} className="min-w-0 block hover:text-gold transition-colors">
                        <span className="font-semibold text-sm flex items-center gap-2">
                          {c.name}
                          {c.is_archived && <span className="text-[0.7rem] text-ink-3">· archived</span>}
                        </span>
                        {c.email && <span className="text-xs text-ink-3 truncate block">{c.email}</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {unbilledAmt > 0 ? (
                        <span className="num text-sm text-gold font-semibold">{formatMoney(unbilledAmt, c.currency)}</span>
                      ) : (
                        <span className="num text-sm text-ink-3">{formatMoney(0, c.currency)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right num text-sm text-ink-2">
                      {c.default_rate != null ? `${formatMoney(c.default_rate, c.currency)}/h` : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-center num text-sm text-ink-2">
                      {activeByClient.get(c.id) ?? 0}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm text-ink-2">
                      {relativeDate(lastByClient.get(c.id) ?? null)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
