import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InvoiceGenerateButton } from "@/components/InvoiceGenerateButton";
import { MarkSentButton } from "@/components/MarkSentButton";
import { UpgradeButton } from "@/components/UpgradeButton";
import { TemplateUploadForm } from "@/components/TemplateUploadForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import {
  buildInvoiceDraft,
  formatMoney,
  listUnbilledClients,
} from "@/lib/invoice";
import { getPlan } from "@/lib/plan";
import { setDefaultTemplate, deleteTemplate } from "@/app/actions/invoiceTemplates";

const INVOICE_BUCKET = "invoices";

const STATUS_TONE: Record<string, string> = {
  draft: "text-ink-3",
  sent: "text-ink",
  paid: "text-gold font-semibold",
  void: "text-ink-3 line-through",
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  currency: string;
  total: number;
  issued_date: string | null;
  pdf_path: string | null;
  docx_path: string | null;
  clients: { name: string } | null;
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(d));
}

const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || null;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-ink-2 mt-1">
          Turn unbilled time into an invoice — no setup needed.
        </p>
      </div>
      {children}
    </div>
  );
}

const TRUST_LINE =
  "Rates locked at generation — later rate changes never affect this invoice.";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const doneId = first(sp.done);
  const clientId = first(sp.client);
  const projectId = first(sp.project);

  const supabase = await createClient();

  // Step 3 — success: the invoice exists; offer downloads and next actions.
  if (doneId) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, currency, total, pdf_path, docx_path, clients(name)")
      .eq("id", doneId)
      .maybeSingle();

    if (invoice) {
      const [pdfUrl, docxUrl] = await Promise.all([
        invoice.pdf_path
          ? supabase.storage.from(INVOICE_BUCKET).createSignedUrl(invoice.pdf_path, 300).then((r) => r.data?.signedUrl ?? null)
          : Promise.resolve(null),
        invoice.docx_path
          ? supabase.storage.from(INVOICE_BUCKET).createSignedUrl(invoice.docx_path, 300).then((r) => r.data?.signedUrl ?? null)
          : Promise.resolve(null),
      ]);
      const client = invoice.clients as { name: string } | null;

      return (
        <Shell>
          <div>
            <Link href="/invoices" className="btn btn-ghost btn-sm">← All invoices</Link>
          </div>
          <section
            className="panel px-6 py-10 text-center flex flex-col items-center gap-5"
            style={{ borderColor: "var(--gold-line)" }}
          >
            <div>
              <h2 className="text-lg font-semibold">
                Invoice <span className="num">{invoice.invoice_number}</span> ready
              </h2>
              <p className="text-sm text-ink-2 mt-1">
                {client?.name ?? "—"} ·{" "}
                <span className="num">{formatMoney(invoice.total, invoice.currency)}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {pdfUrl && (
                <a href={pdfUrl} className="btn btn-accent" download>↓ Download PDF</a>
              )}
              {docxUrl && (
                <a href={docxUrl} className={pdfUrl ? "btn" : "btn btn-accent"} download>↓ Download .docx</a>
              )}
              <MarkSentButton invoiceId={invoice.id} status={invoice.status} />
            </div>
            {!pdfUrl && docxUrl && (
              <p className="text-xs text-ink-3">PDF conversion not configured — .docx is ready.</p>
            )}
            {!pdfUrl && !docxUrl && (
              <p className="text-xs text-ink-3">
                The invoice is saved, but its document couldn’t be rendered. Open it for details.
              </p>
            )}
            <Link
              href={`/invoices/${invoice.id}`}
              className="text-sm text-ink-2 hover:text-ink transition-colors"
            >
              View invoice →
            </Link>
          </section>
        </Shell>
      );
    }
    // Unknown id — fall through to the pick step.
  }

  // Step 2 — preview: a server-computed dry run through the exact code path
  // the generator uses (buildInvoiceDraft); nothing is written.
  if (clientId) {
    const [draftRes, plan, unbilled, { data: auth }] = await Promise.all([
      buildInvoiceDraft(supabase, { clientId, projectId }),
      getPlan(supabase),
      listUnbilledClients(supabase),
      supabase.auth.getUser(),
    ]);

    if ("error" in draftRes) {
      return (
        <Shell>
          <section className="panel px-6 py-10 text-center flex flex-col items-center gap-4">
            <p className="text-sm text-ink-2 max-w-md mx-auto">{draftRes.error}</p>
            <Link href="/invoices" className="btn">Choose another client</Link>
          </section>
        </Shell>
      );
    }

    const { draft } = draftRes;
    const summary = unbilled.find((c) => c.id === clientId);
    const user = auth.user;

    // Pro-only: when a user keeps more than one custom template, let them pick
    // which one styles this invoice. With 0 or 1 template the default resolves
    // automatically (no decision). Template choice never changes the amounts.
    const templateParam = first(sp.template);
    let templates: { id: string; name: string; is_default: boolean }[] = [];
    if (plan.canUseAdvanced) {
      const { data } = await supabase
        .from("invoice_templates")
        .select("id, name, is_default")
        .order("created_at", { ascending: true });
      templates = data ?? [];
    }
    // Only an explicit, valid choice is forwarded to generate; otherwise the
    // action resolves the default itself, keeping the automatic path automatic.
    const selectedTemplateId =
      plan.canUseAdvanced && templateParam && templates.some((t) => t.id === templateParam)
        ? templateParam
        : null;
    // What generation would actually use, for the selector's active highlight.
    const activeTemplateId =
      selectedTemplateId ?? templates.find((t) => t.is_default)?.id ?? null;

    // Keep client, project and template selections intact when navigating.
    const previewHref = (next: { project?: string | null; template?: string | null }) => {
      const p = new URLSearchParams({ client: clientId });
      const proj = next.project !== undefined ? next.project : projectId;
      const tmpl = next.template !== undefined ? next.template : selectedTemplateId;
      if (proj) p.set("project", proj);
      if (tmpl) p.set("template", tmpl);
      return `/invoices?${p.toString()}`;
    };

    return (
      <Shell>
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="panel-title">Invoice preview — {draft.client.name}</h2>
            <Link href="/invoices" className="btn btn-ghost btn-sm">← All invoices</Link>
          </div>

          {/* Project narrowing — optional, visually secondary */}
          {summary && summary.projects.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="label">Narrow to</span>
              <Link
                href={previewHref({ project: null })}
                className={!projectId ? "text-ink font-medium" : "text-ink-3 hover:text-ink transition-colors"}
              >
                All projects
              </Link>
              {summary.projects.map((p) => (
                <Link
                  key={p.id}
                  href={previewHref({ project: p.id })}
                  className={projectId === p.id ? "text-ink font-medium" : "text-ink-3 hover:text-ink transition-colors"}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          )}

          {/* Template — Pro-only, only when there's a real choice (>1). Secondary. */}
          {plan.canUseAdvanced && templates.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="label">Template</span>
              {templates.map((t) => (
                <Link
                  key={t.id}
                  href={previewHref({ template: t.id })}
                  className={activeTemplateId === t.id ? "text-ink font-medium" : "text-ink-3 hover:text-ink transition-colors"}
                >
                  {t.name}
                </Link>
              ))}
            </div>
          )}

          {/* Meta strip */}
          <div className="flex flex-wrap gap-x-10 gap-y-4 pb-5 rule-b">
            <div>
              <div className="text-sm">
                {fmtDate(draft.coveredFrom)} – {fmtDate(draft.coveredTo)}
              </div>
              <div className="label mt-1">Period covered</div>
            </div>
            <div>
              <div className="num text-sm">{draft.entryIds.length}</div>
              <div className="label mt-1">Entries</div>
            </div>
            <div>
              <div className="num text-sm">{draft.billableHours.toFixed(2)} h</div>
              <div className="label mt-1">Billable hours</div>
            </div>
            <div>
              <div className="num text-sm text-gold">{formatMoney(draft.total, draft.currency)}</div>
              <div className="label mt-1">Total</div>
            </div>
          </div>

          {/* Line items — exactly what generation would produce */}
          <div className="flex flex-col gap-2">
            <div className="panel overflow-x-auto">
              <table className="w-full border-collapse min-w-[520px]">
                <thead>
                  <tr className="bg-surface-2">
                    <th className="text-left label font-semibold px-4 py-3 rule-b">Task</th>
                    <th className="text-right label font-semibold px-4 py-3 rule-b">Hours</th>
                    <th className="text-right label font-semibold px-4 py-3 rule-b">Rate</th>
                    <th className="text-right label font-semibold px-4 py-3 rule-b">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((l, i) => (
                    <tr key={l.taskId ?? i} className="rule-b last:border-b-0">
                      <td className="px-4 py-3 text-sm truncate">{l.description}</td>
                      <td className="px-4 py-3 text-right num text-sm">{l.hours.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right num text-sm text-ink-2">{formatMoney(l.rate, draft.currency)}</td>
                      <td className="px-4 py-3 text-right num text-sm">{formatMoney(l.amount, draft.currency)}</td>
                    </tr>
                  ))}
                  {draft.tax.amount > 0 && (
                    <>
                      <tr>
                        <td className="px-4 py-2.5 label" colSpan={3}>Subtotal</td>
                        <td className="px-4 py-2.5 text-right num text-sm">{formatMoney(draft.subtotal, draft.currency)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 label" colSpan={3}>
                          {(draft.tax.label || "Tax")} ({draft.tax.rate}%)
                        </td>
                        <td className="px-4 py-2.5 text-right num text-sm">{formatMoney(draft.tax.amount, draft.currency)}</td>
                      </tr>
                    </>
                  )}
                  <tr className="bg-surface-2">
                    <td className="px-4 py-3 label" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-right num font-semibold text-gold">{formatMoney(draft.total, draft.currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-3 flex items-center gap-1.5">
              <span aria-hidden>🔒</span>
              {TRUST_LINE}
            </p>
          </div>

          {/* Generate — or the upgrade moment. The action re-checks the plan
              server-side either way. */}
          {plan.canInvoice ? (
            <InvoiceGenerateButton
              clientId={draft.client.id}
              projectId={projectId}
              templateId={selectedTemplateId}
            />
          ) : (
            <div
              className="panel p-5 flex flex-wrap items-center justify-between gap-4"
              style={{ borderColor: "var(--gold-line)" }}
            >
              <p className="text-sm text-ink-2 max-w-md">
                This is the exact invoice you’d get. Upgrade to generate it as a
                PDF and .docx you can send — your selection stays right here.
              </p>
              <UpgradeButton
                email={user?.email ?? null}
                userId={user?.id ?? ""}
                label="Unlock invoicing — $9/mo"
              />
            </div>
          )}
        </section>
      </Shell>
    );
  }

  // Step 1 — pick: only clients with unbilled billable time, largest first.
  const [unbilled, plan, { data: invoices }] = await Promise.all([
    listUnbilledClients(supabase),
    getPlan(supabase),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, currency, total, issued_date, pdf_path, docx_path, clients(name)")
      .order("created_at", { ascending: false }),
  ]);
  const invoiceList = (invoices ?? []) as unknown as InvoiceRow[];

  // Custom templates are a Pro capability; only load them when unlocked.
  let templates: { id: string; name: string; is_default: boolean }[] = [];
  if (plan.canUseAdvanced) {
    const { data } = await supabase
      .from("invoice_templates")
      .select("id, name, is_default")
      .order("created_at", { ascending: true });
    templates = data ?? [];
  }

  return (
    <Shell>
      <section className="flex flex-col gap-3">
        {unbilled.length === 0 ? (
          <div className="panel px-6 py-10 text-center flex flex-col items-center gap-4">
            <p className="text-sm text-ink-2 max-w-md mx-auto">
              Track billable time on a client’s project, and it shows up here
              ready to invoice.
            </p>
            <Link href="/" className="btn btn-accent">Go to Today</Link>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <h2 className="panel-title">Ready to invoice</h2>
              <span className="text-xs text-ink-3">pick a client to preview</span>
            </div>
            <div className="panel overflow-hidden">
              {unbilled.map((c) => (
                <Link
                  key={c.id}
                  href={`/invoices?client=${c.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 rule-b last:border-b-0 hover:bg-surface-2 transition-colors"
                >
                  <span className="font-medium truncate">{c.name}</span>
                  <span className="flex items-center gap-4 shrink-0">
                    <span className="num text-xs text-ink-3">{c.hours.toFixed(2)} h</span>
                    <span className="num text-sm text-gold">{formatMoney(c.amount, c.currency)}</span>
                    <span aria-hidden className="text-ink-3">→</span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {invoiceList.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="panel-title">All invoices</h2>
            <span className="num text-xs text-ink-3">{invoiceList.length}</span>
          </div>
          <div className="panel overflow-x-auto">
            <table className="w-full border-collapse min-w-[560px]">
              <thead>
                <tr className="bg-surface-2">
                  <th className="text-left label font-semibold px-4 py-3 rule-b">Number</th>
                  <th className="text-left label font-semibold px-4 py-3 rule-b">Client</th>
                  <th className="text-left label font-semibold px-4 py-3 rule-b">Status</th>
                  <th className="text-right label font-semibold px-4 py-3 rule-b">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoiceList.map((inv) => (
                  <tr key={inv.id} className="rule-b last:border-b-0 hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3.5">
                      <Link href={`/invoices/${inv.id}`} className="num text-sm flex items-center gap-2 hover:text-gold transition-colors">
                        {inv.invoice_number}
                        {inv.pdf_path && <span className="badge badge-bill" style={{ fontSize: "0.6rem" }}>PDF</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-ink-2 truncate">{inv.clients?.name ?? "—"}</td>
                    <td className={`px-4 py-3.5 text-sm ${STATUS_TONE[inv.status] ?? ""}`}>{inv.status}</td>
                    <td className="px-4 py-3.5 text-right num text-sm">{formatMoney(inv.total, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Advanced — invoice templates. Pro users manage them here (the default is
          used silently on generate); free users get one quiet teaser, no panel. */}
      {plan.canUseAdvanced ? (
        <details className="panel group">
          <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex flex-wrap items-baseline gap-2 min-w-0">
              <h2 className="panel-title">Advanced — invoice templates</h2>
              <span className="num text-xs text-ink-3">
                {templates.length === 0
                  ? "built-in default"
                  : `${templates.length} template${templates.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <span className="text-ink-3 text-sm transition-transform group-open:rotate-180" aria-hidden>▾</span>
          </summary>
          <div className="p-4 pt-0 flex flex-col gap-4">
            <p className="text-sm text-ink-2">
              Invoices use a built-in layout by default. Upload a .docx to invoice
              with your own — set one as the default, or pick per invoice on the
              preview step.
            </p>
            {templates.length > 0 && (
              <div className="panel overflow-hidden">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 rule-b last:border-b-0"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      {t.is_default && <span className="badge badge-bill">Default</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!t.is_default && (
                        <form
                          action={async () => {
                            "use server";
                            await setDefaultTemplate(t.id);
                          }}
                        >
                          <button type="submit" className="btn btn-ghost btn-sm">
                            Set default
                          </button>
                        </form>
                      )}
                      <ConfirmAction
                        action={deleteTemplate.bind(null, t.id)}
                        label="Delete"
                        confirmLabel="Delete template?"
                        className="btn btn-ghost btn-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div><TemplateUploadForm /></div>
          </div>
        </details>
      ) : (
        <Link
          href="/plan"
          className="inline-flex items-center gap-2 self-start text-xs text-ink-3 hover:text-ink transition-colors"
        >
          Custom invoice templates
          <span className="badge badge-norate">Pro</span>
        </Link>
      )}
    </Shell>
  );
}
