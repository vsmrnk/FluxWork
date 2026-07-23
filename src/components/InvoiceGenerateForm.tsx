"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateInvoice, previewInvoice } from "@/app/actions/invoices";
import { formatMoney } from "@/lib/invoice";
import { Select } from "@/components/Select";

type ClientOption = { id: string; name: string };
type ProjectOption = { id: string; name: string; client_id: string | null };
type TemplateOption = { id: string; name: string; is_default: boolean };

type Preview = {
  lines: { description: string; hours: number; rate: number; amount: number }[];
  subtotal: number;
  tax: { label: string | null; rate: number; amount: number };
  total: number;
  currency: string;
  billableHours: number;
  entryCount: number;
};

export function InvoiceGenerateForm({
  clients,
  projects,
  templates,
  startOpen = false,
}: {
  clients: ClientOption[];
  projects: ProjectOption[];
  templates: TemplateOption[];
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, startPreview] = useTransition();
  const [generating, startGenerate] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const clientProjects = useMemo(
    () => projects.filter((p) => p.client_id === clientId),
    [projects, clientId],
  );

  function readFilters() {
    const fd = new FormData(formRef.current!);
    return {
      clientId,
      projectId: String(fd.get("project_id") ?? "") || null,
      periodStart: String(fd.get("period_start") ?? "") || null,
      periodEnd: String(fd.get("period_end") ?? "") || null,
    };
  }

  function onPreview() {
    setError(null);
    setPreview(null);
    if (!clientId) {
      setError("Select a client first.");
      return;
    }
    startPreview(async () => {
      const res = await previewInvoice(readFilters());
      if ("error" in res) {
        setError(res.error ?? "Couldn't build a preview.");
        return;
      }
      setPreview(res);
    });
  }

  function onGenerate(formData: FormData) {
    setError(null);
    startGenerate(async () => {
      const res = await generateInvoice(formData);
      if (res && "error" in res) {
        setError(res.error ?? "Couldn't generate the invoice.");
        return;
      }
      if (res.id) router.push(`/invoices/${res.id}`);
    });
  }

  if (clients.length === 0) {
    return (
      <p className="text-sm text-ink-2">
        Add a client and track some billable time before creating an invoice.
      </p>
    );
  }

  if (!open) {
    return (
      <button className="btn btn-accent" onClick={() => setOpen(true)}>
        + New invoice
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={onGenerate}
      className="rise border border-line-strong bg-paper-2 p-5 flex flex-col gap-4 rounded-md"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label block mb-2">Client</label>
          <Select
            name="client_id"
            required
            aria-label="Client"
            placeholder="Select a client…"
            value={clientId}
            onChange={(next) => {
              setClientId(next);
              setPreview(null);
            }}
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
        <div>
          <label className="label block mb-2">Project (optional)</label>
          <Select
            name="project_id"
            aria-label="Project"
            defaultValue=""
            options={[
              { value: "", label: "All projects for client" },
              ...clientProjects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
        <div>
          <label className="label block mb-2">Period start (optional)</label>
          <input name="period_start" type="date" className="field" />
        </div>
        <div>
          <label className="label block mb-2">Period end (optional)</label>
          <input name="period_end" type="date" className="field" />
        </div>
        <div>
          <label className="label block mb-2">Template</label>
          <Select
            name="template_id"
            aria-label="Template"
            defaultValue=""
            options={[
              {
                value: "",
                label: templates.some((t) => t.is_default)
                  ? "Your default template"
                  : "Built-in default template",
              },
              ...templates.map((t) => ({
                value: t.id,
                label: `${t.name}${t.is_default ? " (default)" : ""}`,
              })),
            ]}
          />
        </div>
        <div>
          <label className="label block mb-2">Invoice number (optional)</label>
          <input name="invoice_number" className="field num" placeholder="Auto" />
        </div>
        <div>
          <label className="label block mb-2">Due date (optional)</label>
          <input name="due_date" type="date" className="field" />
        </div>
        <div>
          <label className="label block mb-2">Notes (optional)</label>
          <input name="notes" className="field" placeholder="Payment terms…" />
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="rise border border-line rounded-md overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-paper border-b border-line">
            <div className="col-span-6 label text-ink-3">Task</div>
            <div className="col-span-2 label text-ink-3 text-right">Hours</div>
            <div className="col-span-2 label text-ink-3 text-right">Rate</div>
            <div className="col-span-2 label text-ink-3 text-right">Amount</div>
          </div>
          {preview.lines.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-line last:border-b-0 text-sm"
            >
              <div className="col-span-6 truncate">{l.description}</div>
              <div className="col-span-2 text-right num tabular-nums">
                {l.hours.toFixed(2)}
              </div>
              <div className="col-span-2 text-right num tabular-nums text-ink-2">
                {formatMoney(l.rate, preview.currency)}
              </div>
              <div className="col-span-2 text-right num tabular-nums">
                {formatMoney(l.amount, preview.currency)}
              </div>
            </div>
          ))}
          {preview.tax.amount > 0 && (
            <div className="px-4 py-2 bg-paper border-b border-line flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between text-ink-2">
                <span>Subtotal</span>
                <span className="num tabular-nums">{formatMoney(preview.subtotal, preview.currency)}</span>
              </div>
              <div className="flex items-center justify-between text-ink-2">
                <span>{(preview.tax.label || "Tax")} ({preview.tax.rate}%)</span>
                <span className="num tabular-nums">{formatMoney(preview.tax.amount, preview.currency)}</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-2.5 bg-paper">
            <span className="text-xs text-ink-3">
              {preview.entryCount} entries · {preview.billableHours.toFixed(2)} h
            </span>
            <span className="num tabular-nums font-semibold">
              {formatMoney(preview.total, preview.currency)}
            </span>
          </div>
        </div>
      )}

      {error && <p className="num text-xs text-accent">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn"
          onClick={onPreview}
          disabled={previewing}
        >
          {previewing ? "Checking…" : "Preview"}
        </button>
        <button
          type="submit"
          className="btn btn-accent"
          disabled={generating}
        >
          {generating ? "Generating…" : "Generate invoice"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setOpen(false);
            setPreview(null);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
