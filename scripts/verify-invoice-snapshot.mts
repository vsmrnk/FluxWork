// Rate/tax snapshot regression test: once an invoice is generated, editing the
// client's rate or tax later must NEVER rewrite it, while new invoices pick up
// the new values.
//
//   npm run verify:snapshot
//
// Signs in as the verify.mjs test user, seeds a tiny billing graph, drives the
// real buildInvoiceDraft(), persists a snapshot the way generateInvoice does,
// then mutates rates and re-checks.

import { createClient } from "@supabase/supabase-js";
import { buildInvoiceDraft } from "../src/lib/invoice.ts";

const EMAIL = process.env.TEST_EMAIL || "verify_fixed@tempo.test";
const PASSWORD = process.env.TEST_PASSWORD;

const log = (...a: unknown[]) => console.log(...a);
function fail(msg: string): never {
  console.error("✗ FAIL:", msg);
  process.exit(1);
}
const assert = (cond: unknown, msg: string) => {
  if (!cond) fail(msg);
  log("  ✓", msg);
};
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

if (!PASSWORD) fail("Set TEST_PASSWORD (see .env.example).");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: signIn, error: signInErr } = await sb.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
if (signInErr) {
  if (/confirm/i.test(signInErr.message)) {
    console.error("NEEDS_CONFIRM " + EMAIL);
    process.exit(2);
  }
  fail("signIn: " + signInErr.message);
}
const userId = signIn!.user.id;
log("Signed in as", EMAIL);

// Track everything we create so cleanup runs even on assertion failure.
const created: { table: string; id: string }[] = [];
const remember = (table: string, id: string) => created.push({ table, id });

async function cleanup() {
  // Delete invoice first (ON DELETE SET NULL frees the stamped entries; line
  // items cascade), then the rest in reverse dependency order.
  const order = ["invoices", "time_entries", "tasks", "projects", "clients"];
  for (const table of order) {
    const ids = created.filter((c) => c.table === table).map((c) => c.id);
    if (ids.length) await sb.from(table).delete().in("id", ids);
  }
}

try {
  log("\n[1] Seed client (rate 100, VAT 20%), project (inherits), task, 1h billable entry");
  const { data: client, error: cErr } = await sb
    .from("clients")
    .insert({ user_id: userId, name: "Snapshot Co", default_rate: 100, currency: "USD", tax_label: "VAT", tax_rate: 20 })
    .select("*")
    .single();
  if (cErr) fail("insert client: " + cErr.message);
  remember("clients", client!.id);

  const { data: project, error: pErr } = await sb
    .from("projects")
    .insert({ user_id: userId, name: "Snapshot Project", client_id: client!.id, rate: null, is_billable: true })
    .select("*")
    .single();
  if (pErr) fail("insert project: " + pErr.message);
  remember("projects", project!.id);

  const { data: task, error: tErr } = await sb
    .from("tasks")
    .insert({ user_id: userId, project_id: project!.id, name: "Build", is_billable: true })
    .select("*")
    .single();
  if (tErr) fail("insert task: " + tErr.message);
  remember("tasks", task!.id);

  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const { data: entry, error: eErr } = await sb
    .from("time_entries")
    .insert({ user_id: userId, task_id: task!.id, started_at: oneHourAgo, ended_at: nowIso, is_billable: true })
    .select("*")
    .single();
  if (eErr) fail("insert entry: " + eErr.message);
  remember("time_entries", entry!.id);

  log("\n[2] Build draft at rate 100 / VAT 20");
  const r1 = await buildInvoiceDraft(sb, { clientId: client!.id });
  if ("error" in r1) fail("buildInvoiceDraft #1: " + r1.error);
  const d1 = r1.draft;
  assert(d1.lines.length === 1, "one line item");
  assert(near(d1.lines[0].rate, 100), "line rate resolved to 100 (inherited from client)");
  assert(near(d1.subtotal, 100), "subtotal = 100 (1h × 100)");
  assert(near(d1.tax.amount, 20), "tax = 20 (20% of 100)");
  assert(near(d1.total, 120), "total = 120 (subtotal + tax)");

  log("\n[3] Persist the invoice snapshot (mirrors generateInvoice)");
  const { data: invoice, error: invErr } = await sb
    .from("invoices")
    .insert({
      user_id: userId, client_id: client!.id, project_id: project!.id,
      invoice_number: "SNAP-" + Date.now(), status: "draft", currency: d1.currency,
      subtotal: d1.subtotal, tax_label: d1.tax.label, tax_rate: d1.tax.rate,
      tax_amount: d1.tax.amount, total: d1.total,
    })
    .select("*")
    .single();
  if (invErr) fail("insert invoice: " + invErr.message);
  remember("invoices", invoice!.id);

  const { error: liErr } = await sb.from("invoice_line_items").insert(
    d1.lines.map((l, i) => ({
      invoice_id: invoice!.id, user_id: userId, task_id: l.taskId,
      description: l.description, hours: l.hours, rate: l.rate, amount: l.amount, sort_order: i,
    })),
  );
  if (liErr) fail("insert line items: " + liErr.message);
  await sb.from("time_entries").update({ invoice_id: invoice!.id }).eq("id", entry!.id);

  log("\n[4] Change client rate → 200, tax → 0 (simulate a later edit)");
  const { error: upErr } = await sb
    .from("clients")
    .update({ default_rate: 200, tax_rate: 0 })
    .eq("id", client!.id);
  if (upErr) fail("update client rate: " + upErr.message);

  log("\n[5] A NEW entry + draft must see the NEW rate 200 / no tax");
  const { data: entry2, error: e2Err } = await sb
    .from("time_entries")
    .insert({ user_id: userId, task_id: task!.id, started_at: oneHourAgo, ended_at: nowIso, is_billable: true })
    .select("*")
    .single();
  if (e2Err) fail("insert entry2: " + e2Err.message);
  remember("time_entries", entry2!.id);

  const r2 = await buildInvoiceDraft(sb, { clientId: client!.id });
  if ("error" in r2) fail("buildInvoiceDraft #2: " + r2.error);
  const d2 = r2.draft;
  assert(near(d2.lines[0].rate, 200), "NEW draft resolves rate 200 (live resolution works)");
  assert(near(d2.tax.amount, 0), "NEW draft has no tax (client tax now 0)");

  log("\n[6] REGRESSION: the persisted invoice must be UNCHANGED");
  const { data: frozenLines } = await sb
    .from("invoice_line_items")
    .select("rate, amount")
    .eq("invoice_id", invoice!.id);
  assert(near(Number(frozenLines![0].rate), 100), "historical line rate still 100 (NOT 200) — D1 snapshot holds");
  assert(near(Number(frozenLines![0].amount), 100), "historical line amount still 100");

  const { data: frozenInv } = await sb
    .from("invoices")
    .select("subtotal, tax_rate, tax_amount, total")
    .eq("id", invoice!.id)
    .single();
  assert(near(Number(frozenInv!.tax_rate), 20), "historical tax_rate still 20 (NOT 0) — D5 snapshot holds");
  assert(near(Number(frozenInv!.tax_amount), 20), "historical tax_amount still 20");
  assert(near(Number(frozenInv!.total), 120), "historical total still 120");

  log("\n✓ SNAPSHOT REGRESSION PASSED");
} finally {
  await cleanup();
  await sb.auth.signOut();
}
process.exit(0);
