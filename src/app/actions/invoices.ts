"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildInvoiceDraft,
  formatMoney,
  INVOICE_BUCKET,
  type InvoiceDraft,
} from "@/lib/invoice";
import { renderInvoiceDocx, DOCX_MIME } from "@/lib/docx";
import { renderInvoicePdf, type InvoicePdfMeta } from "@/lib/invoicePdf";
import { buildDefaultTemplateDocx } from "@/lib/defaultTemplate";
import { track } from "@/lib/analytics";
import { getPlan } from "@/lib/plan";
import { requireUser } from "@/lib/supabase/server";

const TEMPLATE_BUCKET = "invoice-templates";
const STATUSES = new Set(["draft", "sent", "paid", "void"]);

/** The flat data object handed to the .docx template. */
function templateData(draft: InvoiceDraft, meta: InvoicePdfMeta) {
  return {
    invoice_number: meta.invoiceNumber,
    issued_date: meta.issuedDate,
    due_date: meta.dueDate ?? "",
    currency: draft.currency,
    client_name: draft.client.name,
    client_email: draft.client.email ?? "",
    client_address: draft.client.address ?? "",
    project_name: meta.projectName,
    billable_hours: draft.billableHours.toFixed(2),
    subtotal: formatMoney(draft.subtotal, draft.currency),
    // Drives the {{#has_tax}}…{{/has_tax}} section so zero-tax invoices hide the row.
    has_tax: draft.tax.amount > 0,
    tax_label: draft.tax.label?.trim() || "Tax",
    tax_rate: draft.tax.rate.toFixed(draft.tax.rate % 1 === 0 ? 0 : 2),
    tax_amount: formatMoney(draft.tax.amount, draft.currency),
    total: formatMoney(draft.total, draft.currency),
    total_amount: formatMoney(draft.total, draft.currency),
    notes: meta.notes ?? "",
    items: draft.lines.map((l, i) => ({
      n: i + 1,
      description: l.description,
      hours: l.hours.toFixed(2),
      rate: formatMoney(l.rate, draft.currency),
      amount: formatMoney(l.amount, draft.currency),
    })),
  };
}

export async function generateInvoice(formData: FormData) {
  const { supabase, user } = await requireUser();

  const plan = await getPlan(supabase);
  if (!plan.canInvoice) {
    return { error: "Invoicing is a paid feature. Upgrade to generate invoices." };
  }

  const clientId = String(formData.get("client_id") ?? "").trim();
  if (!clientId) return { error: "Select a client." };

  const projectId = String(formData.get("project_id") ?? "").trim() || null;
  // Custom templates are Pro-only; without one the built-in default renders.
  const templateIdInput = plan.canUseAdvanced
    ? String(formData.get("template_id") ?? "").trim() || null
    : null;
  const periodStart = String(formData.get("period_start") ?? "").trim() || null;
  const periodEnd = String(formData.get("period_end") ?? "").trim() || null;
  const dueDate = String(formData.get("due_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const numberInput = String(formData.get("invoice_number") ?? "").trim() || null;

  const res = await buildInvoiceDraft(supabase, {
    clientId,
    projectId,
    periodStart,
    periodEnd,
  });
  if ("error" in res) return { error: res.error };
  const { draft } = res;

  // INV-0001, INV-0002, … when no number is supplied.
  let invoiceNumber = numberInput;
  if (!invoiceNumber) {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    invoiceNumber = `INV-${String((count ?? 0) + 1).padStart(4, "0")}`;
  }

  const issuedDate = new Date().toISOString().slice(0, 10);

  // Explicit choice, else the user's default template (may be none).
  let template: { storage_path: string } | null = null;
  let templateId: string | null = templateIdInput;
  if (templateIdInput) {
    const { data } = await supabase
      .from("invoice_templates")
      .select("id, storage_path")
      .eq("id", templateIdInput)
      .maybeSingle();
    template = data;
  } else {
    const { data } = await supabase
      .from("invoice_templates")
      .select("id, storage_path")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();
    if (data) {
      template = data;
      templateId = data.id;
    }
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      user_id: user.id,
      client_id: clientId,
      project_id: projectId,
      template_id: templateId,
      invoice_number: invoiceNumber,
      status: "draft",
      currency: draft.currency,
      period_start: periodStart,
      period_end: periodEnd,
      issued_date: issuedDate,
      due_date: dueDate,
      subtotal: draft.subtotal,
      tax_label: draft.tax.label,
      tax_rate: draft.tax.rate,
      tax_amount: draft.tax.amount,
      total: draft.total,
      notes,
    })
    .select("id")
    .single();

  if (invErr) {
    if (invErr.code === "23505") {
      return { error: `Invoice number "${invoiceNumber}" already exists.` };
    }
    return { error: invErr.message };
  }
  const invoiceId = invoice.id;

  const { error: lineErr } = await supabase.from("invoice_line_items").insert(
    draft.lines.map((l, i) => ({
      invoice_id: invoiceId,
      user_id: user.id,
      task_id: l.taskId,
      description: l.description,
      hours: l.hours,
      rate: l.rate,
      amount: l.amount,
      sort_order: i,
    })),
  );
  if (lineErr) {
    await supabase.from("invoices").delete().eq("id", invoiceId);
    return { error: lineErr.message };
  }

  // Claim only still-free entries so nothing is billed twice.
  await supabase
    .from("time_entries")
    .update({ invoice_id: invoiceId })
    .in("id", draft.entryIds)
    .is("invoice_id", null);

  await track(supabase, "invoice_generated", {
    invoice_id: invoiceId,
    total: draft.total,
    currency: draft.currency,
  });

  // The invoice record stands even if rendering its documents fails.
  let warning: string | undefined;
  try {
    let projectName = "";
    if (projectId) {
      const { data: proj } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .maybeSingle();
      projectName = proj?.name ?? "";
    }

    let tmplBuf: Buffer;
    if (template) {
      const { data: tmplBlob, error: dlErr } = await supabase.storage
        .from(TEMPLATE_BUCKET)
        .download(template.storage_path);
      if (dlErr || !tmplBlob) throw new Error(dlErr?.message ?? "template missing");
      tmplBuf = Buffer.from(await tmplBlob.arrayBuffer());
    } else {
      tmplBuf = buildDefaultTemplateDocx();
    }

    const meta = { invoiceNumber, issuedDate, dueDate, projectName, notes };
    const docxPath = `${user.id}/${invoiceId}.docx`;
    const { error: docxUpErr } = await supabase.storage
      .from(INVOICE_BUCKET)
      .upload(docxPath, renderInvoiceDocx(tmplBuf, templateData(draft, meta)), {
        contentType: DOCX_MIME,
        upsert: true,
      });
    if (docxUpErr) throw new Error(docxUpErr.message);

    // Best-effort: a PDF failure must not cost the user the uploaded .docx.
    let pdfPath: string | null = null;
    try {
      const candidate = `${user.id}/${invoiceId}.pdf`;
      const { error: pdfUpErr } = await supabase.storage
        .from(INVOICE_BUCKET)
        .upload(candidate, await renderInvoicePdf(draft, meta), {
          contentType: "application/pdf",
          upsert: true,
        });
      if (!pdfUpErr) pdfPath = candidate;
    } catch {
      pdfPath = null;
    }

    await supabase
      .from("invoices")
      .update({ docx_path: docxPath, pdf_path: pdfPath })
      .eq("id", invoiceId);
  } catch (e) {
    warning =
      "Invoice saved, but document generation failed: " +
      (e instanceof Error ? e.message : "unknown error") +
      (template ? ". Check that your template's placeholders match." : ".");
  }

  revalidatePath("/invoices");
  return { ok: true as const, id: invoiceId, warning };
}

export async function updateInvoiceStatus(invoiceId: string, status: string) {
  const { supabase } = await requireUser();
  if (!STATUSES.has(status)) return { error: "Invalid status." };
  const { error } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", invoiceId);
  if (error) return { error: error.message };
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

export async function deleteInvoice(invoiceId: string) {
  const { supabase } = await requireUser();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("docx_path, pdf_path")
    .eq("id", invoiceId)
    .maybeSingle();

  // ON DELETE SET NULL frees the stamped time_entries; line items cascade.
  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) return { error: error.message };

  const paths = [invoice?.docx_path, invoice?.pdf_path].filter(
    (p): p is string => Boolean(p),
  );
  if (paths.length) await supabase.storage.from(INVOICE_BUCKET).remove(paths);

  revalidatePath("/invoices");
  redirect("/invoices");
}
