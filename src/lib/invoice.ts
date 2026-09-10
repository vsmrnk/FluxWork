import type { Supabase } from "@/lib/supabase/server";

/**
 * Rate model: a project's effective hourly rate is its own `rate`, else the
 * client's `default_rate`, else 0. It is resolved at draft time and
 * snapshotted onto each line item, so a generated invoice never shifts when
 * rates are edited later.
 */

type InvoiceLineDraft = {
  taskId: string | null;
  description: string;
  hours: number; // 4dp, from summed billable seconds
  rate: number;
  amount: number; // round2(hours * rate)
};

export type InvoiceDraft = {
  client: {
    id: string;
    name: string;
    email: string | null;
    address: string | null;
    currency: string;
  };
  lines: InvoiceLineDraft[];
  subtotal: number;
  tax: {
    label: string | null;
    rate: number; // percentage, e.g. 20 = 20%
    amount: number;
  };
  total: number;
  currency: string;
  billableHours: number;
  entryIds: string[]; // entries to stamp on generate
  periodStart: string | null;
  periodEnd: string | null;
  /** Actual span of the selected entries (min/max started_at). */
  coveredFrom: string | null;
  coveredTo: string | null;
};

export const INVOICE_BUCKET = "invoices";

/** Five-minute download link for a generated invoice file. */
export async function signedInvoiceUrl(supabase: Supabase, path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from(INVOICE_BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    // Unknown currency code — fall back to a plain number + code.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Parses a rate field; empty means null (inherit the client's rate). */
export function parseRate(
  raw: FormDataEntryValue | null,
): { value: number | null } | { error: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { value: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { error: "Rate must be a positive number." };
  return { value: round2(n) };
}

/**
 * Billable, not-yet-invoiced, completed entries for a client (optionally one
 * project and an inclusive date window), aggregated into one line per task.
 */
export async function buildInvoiceDraft(
  supabase: Supabase,
  {
    clientId,
    projectId,
    periodStart,
    periodEnd,
  }: {
    clientId: string;
    projectId?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
  },
): Promise<{ draft: InvoiceDraft } | { error: string }> {
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, name, email, address, currency, default_rate, tax_label, tax_rate")
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr) return { error: clientErr.message };
  if (!client) return { error: "Client not found." };

  let projectQuery = supabase
    .from("projects")
    .select("id, name, rate")
    .eq("client_id", clientId);
  if (projectId) projectQuery = projectQuery.eq("id", projectId);

  const { data: projects, error: projErr } = await projectQuery;
  if (projErr) return { error: projErr.message };
  if (!projects || projects.length === 0) {
    return { error: "This client has no projects to invoice." };
  }

  const effectiveRate = new Map<string, number>();
  const projectName = new Map<string, string>();
  for (const p of projects) {
    effectiveRate.set(p.id, p.rate ?? client.default_rate ?? 0);
    projectName.set(p.id, p.name);
  }

  const projectIds = projects.map((p) => p.id);
  const { data: tasks, error: taskErr } = await supabase
    .from("tasks")
    .select("id, name, project_id")
    .in("project_id", projectIds);
  if (taskErr) return { error: taskErr.message };

  const taskMeta = new Map<string, { name: string; projectId: string }>();
  for (const t of tasks ?? []) {
    taskMeta.set(t.id, { name: t.name, projectId: t.project_id });
  }
  const taskIds = [...taskMeta.keys()];
  if (taskIds.length === 0) {
    return { error: "No billable time available for this client." };
  }

  let entryQuery = supabase
    .from("time_entries")
    .select("id, task_id, duration_seconds, started_at")
    .in("task_id", taskIds)
    .eq("is_billable", true)
    .is("invoice_id", null)
    .not("ended_at", "is", null);
  if (periodStart) entryQuery = entryQuery.gte("started_at", periodStart);
  if (periodEnd) {
    // periodEnd is an inclusive date; include the whole day.
    entryQuery = entryQuery.lte("started_at", `${periodEnd}T23:59:59.999Z`);
  }

  const { data: entries, error: entryErr } = await entryQuery;
  if (entryErr) return { error: entryErr.message };
  if (!entries || entries.length === 0) {
    return { error: "No billable time to invoice for the selected filters." };
  }

  const secondsByTask = new Map<string, number>();
  const entryIds: string[] = [];
  let coveredFrom: string | null = null;
  let coveredTo: string | null = null;
  for (const e of entries) {
    entryIds.push(e.id);
    secondsByTask.set(
      e.task_id,
      (secondsByTask.get(e.task_id) ?? 0) + (e.duration_seconds ?? 0),
    );
    if (!coveredFrom || Date.parse(e.started_at) < Date.parse(coveredFrom)) {
      coveredFrom = e.started_at;
    }
    if (!coveredTo || Date.parse(e.started_at) > Date.parse(coveredTo)) {
      coveredTo = e.started_at;
    }
  }

  const lines: InvoiceLineDraft[] = [];
  for (const [taskId, seconds] of secondsByTask) {
    const meta = taskMeta.get(taskId);
    if (!meta) continue;
    const hours = round4(seconds / 3600);
    if (hours <= 0) continue;
    const rate = effectiveRate.get(meta.projectId) ?? 0;
    const label =
      projectIds.length > 1
        ? `${projectName.get(meta.projectId)} — ${meta.name}`
        : meta.name;
    lines.push({
      taskId,
      description: label,
      hours,
      rate,
      amount: round2(hours * rate),
    });
  }

  if (lines.length === 0) {
    return { error: "No billable time to invoice for the selected filters." };
  }

  lines.sort((a, b) => b.amount - a.amount);

  const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0));
  const billableHours = round2(lines.reduce((a, l) => a + l.hours, 0));

  // One tax line: the client's current tax settings applied to the subtotal.
  const taxRate = client.tax_rate ?? 0;
  const taxAmount = taxRate > 0 ? round2((subtotal * taxRate) / 100) : 0;

  return {
    draft: {
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        address: client.address,
        currency: client.currency,
      },
      lines,
      subtotal,
      tax: { label: client.tax_label ?? null, rate: taxRate, amount: taxAmount },
      total: round2(subtotal + taxAmount),
      currency: client.currency,
      billableHours,
      entryIds,
      periodStart: periodStart ?? null,
      periodEnd: periodEnd ?? null,
      coveredFrom,
      coveredTo,
    },
  };
}

type UnbilledClient = {
  id: string;
  name: string;
  currency: string;
  hours: number;
  amount: number;
  /** Only projects with unbilled billable time, highest amount first. */
  projects: { id: string; name: string; amount: number }[];
};

/**
 * Unbilled totals per client, largest first. Uses buildInvoiceDraft's entry
 * selection and per-task rounding, so each amount equals that client's
 * invoice subtotal to the cent.
 */
export async function listUnbilledClients(
  supabase: Supabase,
): Promise<UnbilledClient[]> {
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, currency, default_rate")
    .eq("is_archived", false);
  if (!clients || clients.length === 0) return [];

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, rate, client_id")
    .in("client_id", clients.map((c) => c.id));
  if (!projects || projects.length === 0) return [];

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, project_id")
    .in("project_id", projects.map((p) => p.id));
  const projectByTask = new Map((tasks ?? []).map((t) => [t.id, t.project_id]));
  if (projectByTask.size === 0) return [];

  const { data: entries } = await supabase
    .from("time_entries")
    .select("task_id, duration_seconds")
    .in("task_id", [...projectByTask.keys()])
    .eq("is_billable", true)
    .is("invoice_id", null)
    .not("ended_at", "is", null);

  const secondsByTask = new Map<string, number>();
  for (const e of entries ?? []) {
    secondsByTask.set(
      e.task_id,
      (secondsByTask.get(e.task_id) ?? 0) + (e.duration_seconds ?? 0),
    );
  }

  type Acc = { hours: number; amount: number; byProject: Map<string, number> };
  const perClient = new Map<string, Acc>();
  for (const [taskId, seconds] of secondsByTask) {
    const projectId = projectByTask.get(taskId);
    const project = projectId ? projectById.get(projectId) : undefined;
    if (!project?.client_id) continue;
    const client = clientById.get(project.client_id);
    if (!client) continue;
    const hours = round4(seconds / 3600);
    if (hours <= 0) continue;
    const rate = project.rate ?? client.default_rate ?? 0;
    const amount = round2(hours * rate);
    const acc =
      perClient.get(client.id) ??
      { hours: 0, amount: 0, byProject: new Map<string, number>() };
    acc.hours += hours;
    acc.amount += amount;
    acc.byProject.set(project.id, (acc.byProject.get(project.id) ?? 0) + amount);
    perClient.set(client.id, acc);
  }

  const result: UnbilledClient[] = [];
  for (const [clientId, acc] of perClient) {
    const client = clientById.get(clientId);
    if (!client) continue;
    result.push({
      id: clientId,
      name: client.name,
      currency: client.currency,
      hours: round2(acc.hours),
      amount: round2(acc.amount),
      projects: [...acc.byProject.entries()]
        .map(([id, amount]) => ({
          id,
          name: projectById.get(id)?.name ?? "",
          amount: round2(amount),
        }))
        .sort((a, b) => b.amount - a.amount),
    });
  }
  result.sort((a, b) => b.amount - a.amount);
  return result;
}
