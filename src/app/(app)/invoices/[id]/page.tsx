import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfirmAction } from "@/components/ConfirmAction";
import { InvoiceStatusControl } from "@/components/InvoiceStatusControl";
import { deleteInvoice } from "@/app/actions/invoices";
import { formatMoney, signedInvoiceUrl } from "@/lib/invoice";
import { formatDate } from "@/lib/time";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: invoice }, { data: lines }] = await Promise.all([
    supabase.from("invoices").select("*, clients(name)").eq("id", id).maybeSingle(),
    supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", id)
      .order("sort_order", { ascending: true }),
  ]);
  if (!invoice) notFound();
  const lineList = lines ?? [];

  const [docxUrl, pdfUrl] = await Promise.all([
    signedInvoiceUrl(supabase, invoice.docx_path),
    signedInvoiceUrl(supabase, invoice.pdf_path),
  ]);

  const period =
    invoice.period_start || invoice.period_end
      ? `${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`
      : "All time";
  const totalHours = lineList.reduce((a, l) => a + Number(l.hours), 0);

  return (
    <div className="page page-doc">
      <nav className="flex items-center gap-2 text-sm text-ink-3">
        <Link href="/invoices" className="hover:text-ink transition-colors">Invoices</Link>
        <span aria-hidden>/</span>
        <span className="num text-ink-2 truncate">{invoice.invoice_number}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="num text-2xl font-semibold tracking-tight">{invoice.invoice_number}</h1>
          <p className="text-sm text-ink-2 mt-1">
            {invoice.clients?.name ?? "—"} · Issued {formatDate(invoice.issued_date)}
            {invoice.due_date && ` · Due ${formatDate(invoice.due_date)}`}
          </p>
        </div>
        <InvoiceStatusControl invoiceId={id} status={invoice.status} />
      </div>

      {/* Download */}
      <div className="flex flex-wrap items-center gap-3">
        {pdfUrl ? (
          <a href={pdfUrl} className="btn btn-accent" download>↓ Download PDF</a>
        ) : null}
        {docxUrl ? (
          <a href={docxUrl} className="btn" download>↓ Download .docx</a>
        ) : (
          <span className="btn" style={{ opacity: 0.5, cursor: "not-allowed" }}>No document</span>
        )}
        {!pdfUrl && (
          <span className="text-xs text-ink-3">PDF conversion not configured — .docx is ready.</span>
        )}
      </div>

      {/* Meta strip */}
      <div className="flex flex-wrap gap-x-10 gap-y-4 pb-6 rule-b">
        <div>
          <div className="text-sm">{period}</div>
          <div className="label mt-1">Period</div>
        </div>
        <div>
          <div className="num text-sm">{totalHours.toFixed(2)} h</div>
          <div className="label mt-1">Billable hours</div>
        </div>
        <div>
          <div className="num text-sm text-gold">{formatMoney(invoice.total, invoice.currency)}</div>
          <div className="label mt-1">Total</div>
        </div>
      </div>

      {/* Line items */}
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
              {lineList.map((l) => (
                <tr key={l.id} className="rule-b last:border-b-0">
                  <td className="px-4 py-3 text-sm truncate">{l.description}</td>
                  <td className="px-4 py-3 text-right num text-sm">{Number(l.hours).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right num text-sm text-ink-2">{formatMoney(l.rate, invoice.currency)}</td>
                  <td className="px-4 py-3 text-right num text-sm">{formatMoney(l.amount, invoice.currency)}</td>
                </tr>
              ))}
              {Number(invoice.tax_amount) > 0 && (
                <>
                  <tr>
                    <td className="px-4 py-2.5 label" colSpan={3}>Subtotal</td>
                    <td className="px-4 py-2.5 text-right num text-sm">{formatMoney(invoice.subtotal, invoice.currency)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 label" colSpan={3}>
                      {(invoice.tax_label || "Tax")} ({Number(invoice.tax_rate)}%)
                    </td>
                    <td className="px-4 py-2.5 text-right num text-sm">{formatMoney(invoice.tax_amount, invoice.currency)}</td>
                  </tr>
                </>
              )}
              <tr className="bg-surface-2">
                <td className="px-4 py-3 label" colSpan={3}>Total</td>
                <td className="px-4 py-3 text-right num font-semibold text-gold">{formatMoney(invoice.total, invoice.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-3 flex items-center gap-1.5">
          <span aria-hidden>🔒</span>
          Rates locked at generation — later rate changes never affect this invoice.
        </p>
      </div>

      {invoice.notes && <p className="text-sm text-ink-2">{invoice.notes}</p>}

      <section className="rule-t pt-6 flex flex-wrap items-center gap-3">
        <ConfirmAction action={deleteInvoice.bind(null, id)} label="Delete invoice" confirmLabel="Delete invoice?" className="btn btn-danger" />
        <p className="text-xs text-ink-3 ml-auto">Deleting frees its time entries to be invoiced again.</p>
      </section>
    </div>
  );
}
