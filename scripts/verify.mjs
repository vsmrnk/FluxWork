// End-to-end verification: drives the real Supabase API as an authenticated
// user, exercising RLS, the generated duration column, and roll-up views.
//
//   npm run verify -- signup   -> create the test user
//   npm run verify             -> sign in, CRUD, verify, cleanup
//
// Uses NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY and
// TEST_EMAIL / TEST_PASSWORD; the npm script loads .env.local.

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.TEST_EMAIL || "verify_fixed@tempo.test";
const PASSWORD = process.env.TEST_PASSWORD;

const mode = process.argv[2] || "run";
const log = (...a) => console.log(...a);
const fail = (msg) => {
  console.error("✗ FAIL:", msg);
  process.exit(1);
};
const assert = (cond, msg) => {
  if (!cond) fail(msg);
  log("  ✓", msg);
};

if (!PASSWORD) fail("Set TEST_PASSWORD (see .env.example).");

function anon() {
  return createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

if (mode === "signup") {
  const sb = anon();
  const { data, error } = await sb.auth.signUp({
    email: EMAIL,
    password: PASSWORD,
  });
  if (error && !/already registered/i.test(error.message)) {
    fail("signUp: " + error.message);
  }
  log("SIGNUP_EMAIL=" + EMAIL);
  log("HAS_SESSION=" + Boolean(data?.session));
  process.exit(0);
}

// --- run: sign in and drive the full flow ---
const sb = anon();
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
const userId = signIn.user.id;
log("Signed in as", EMAIL, "(" + userId + ")");

log("\n[1] Create project");
const { data: project, error: pErr } = await sb
  .from("projects")
  .insert({ user_id: userId, name: "Verification Project", client: "Internal", code: "VER-1", color: "#ff3b00" })
  .select("*")
  .single();
if (pErr) fail("insert project: " + pErr.message);
assert(project.id, "project row persisted with id " + project.id);
assert(project.user_id === userId, "project.user_id matches auth user");

log("\n[2] Create task + nested subtask");
const { data: task, error: tErr } = await sb
  .from("tasks")
  .insert({ user_id: userId, project_id: project.id, name: "Design pass" })
  .select("*")
  .single();
if (tErr) fail("insert task: " + tErr.message);
assert(task.project_id === project.id, "task linked to project via FK");
assert(task.parent_id === null, "top-level task has null parent_id");

const { data: subtask, error: stErr } = await sb
  .from("tasks")
  .insert({ user_id: userId, project_id: project.id, parent_id: task.id, name: "Wireframes" })
  .select("*")
  .single();
if (stErr) fail("insert subtask: " + stErr.message);
assert(subtask.parent_id === task.id, "subtask references parent via self-FK");

log("\n[3] Log a completed time entry (90 minutes)");
const start = new Date(Date.now() - 90 * 60 * 1000);
const end = new Date();
const { data: entry, error: eErr } = await sb
  .from("time_entries")
  .insert({ user_id: userId, task_id: task.id, started_at: start.toISOString(), ended_at: end.toISOString(), notes: "manual verify" })
  .select("*")
  .single();
if (eErr) fail("insert entry: " + eErr.message);
assert(
  Math.abs(entry.duration_seconds - 5400) <= 1,
  "generated duration_seconds ≈ 5400 (got " + entry.duration_seconds + ")",
);

log("\n[4] Start + stop an overlapping running timer");
const { data: running, error: rErr } = await sb
  .from("time_entries")
  .insert({ user_id: userId, task_id: task.id, started_at: new Date(Date.now() - 10 * 1000).toISOString(), ended_at: null })
  .select("*")
  .single();
if (rErr) fail("insert running entry: " + rErr.message);
assert(running.duration_seconds === null, "running entry has null duration");

const { data: stopped, error: sErr } = await sb
  .from("time_entries")
  .update({ ended_at: new Date().toISOString() })
  .eq("id", running.id)
  .select("*")
  .single();
if (sErr) fail("stop timer: " + sErr.message);
assert(stopped.duration_seconds >= 10, "stopped timer computed duration (" + stopped.duration_seconds + "s)");

log("\n[5] Verify roll-up views");
const { data: pr, error: prErr } = await sb
  .from("project_rollups")
  .select("*")
  .eq("project_id", project.id)
  .single();
if (prErr) fail("project_rollups: " + prErr.message);
const expected = 5400 + stopped.duration_seconds;
assert(pr.task_count === 2, "project_rollups.task_count = 2 (task + subtask)");
assert(pr.entry_count === 2, "project_rollups.entry_count = 2");
assert(pr.total_seconds === expected, "project_rollups.total_seconds = " + expected + " (got " + pr.total_seconds + ")");
assert(pr.billable_seconds === expected, "project_rollups.billable_seconds = " + expected);

const { data: tr } = await sb.from("task_rollups").select("*").eq("task_id", task.id).single();
assert(tr.total_seconds === expected, "task_rollups.total_seconds = " + expected);

log("\n[6] Verify RLS isolation (anonymous client sees nothing)");
const stranger = anon();
const { data: leaked } = await stranger.from("projects").select("*").eq("id", project.id);
assert((leaked ?? []).length === 0, "unauthenticated client cannot read the project (RLS enforced)");

log("\n[7] Self-referencing cascade: deleting parent task removes its subtask");
const { error: dtErr } = await sb.from("tasks").delete().eq("id", task.id);
if (dtErr) fail("delete parent task: " + dtErr.message);
const { data: subGone } = await sb.from("tasks").select("id").eq("id", subtask.id);
assert((subGone ?? []).length === 0, "subtask cascade-deleted with its parent");
const { data: entriesGone } = await sb.from("time_entries").select("id").eq("task_id", task.id);
assert((entriesGone ?? []).length === 0, "parent task's time entries cascade-deleted");

log("\n[8] Cascade delete: removing project removes remaining tasks");
const { error: delErr } = await sb.from("projects").delete().eq("id", project.id);
if (delErr) fail("delete project: " + delErr.message);
const { data: orphanTasks } = await sb.from("tasks").select("id").eq("project_id", project.id);
assert((orphanTasks ?? []).length === 0, "all project tasks cascade-deleted");

log("\n✓ ALL CHECKS PASSED");
await sb.auth.signOut();
process.exit(0);
