-- SECURITY FIX · Restore RLS enforcement on public.task_rollups.
--
-- 20260704125909 created this view WITH (security_invoker = on) so it runs as
-- the querying user and the owner-only RLS policies on tasks/time_entries
-- apply. 20260804213755 appended planning columns with a bare
-- `create or replace view` — and CREATE OR REPLACE VIEW resets any reloptions
-- that the new statement does not restate, silently dropping security_invoker.
--
-- The view then ran as its owner, bypassing RLS, while anon + authenticated
-- still hold SELECT on it: any caller with the public anon key could read
-- every user's task names, tracked hours and estimates.
--
-- ALTER VIEW ... SET is used instead of another CREATE OR REPLACE so this
-- migration touches only the option and cannot drift from the definition.
alter view public.task_rollups set (security_invoker = on);

-- Guard against the same regression: project_rollups was never broken, but
-- restating it here makes the invariant explicit and the migration idempotent.
alter view public.project_rollups set (security_invoker = on);
