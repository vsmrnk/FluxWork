-- ============================================================
-- RLS: every row is private to its owner (auth.uid() = user_id)
-- ============================================================

alter table public.projects     enable row level security;
alter table public.tasks         enable row level security;
alter table public.time_entries  enable row level security;

-- projects
create policy "projects_select_own" on public.projects
  for select using ((select auth.uid()) = user_id);
create policy "projects_insert_own" on public.projects
  for insert with check ((select auth.uid()) = user_id);
create policy "projects_update_own" on public.projects
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "projects_delete_own" on public.projects
  for delete using ((select auth.uid()) = user_id);

-- tasks
create policy "tasks_select_own" on public.tasks
  for select using ((select auth.uid()) = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert with check ((select auth.uid()) = user_id);
create policy "tasks_update_own" on public.tasks
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete using ((select auth.uid()) = user_id);

-- time_entries
create policy "time_entries_select_own" on public.time_entries
  for select using ((select auth.uid()) = user_id);
create policy "time_entries_insert_own" on public.time_entries
  for insert with check ((select auth.uid()) = user_id);
create policy "time_entries_update_own" on public.time_entries
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "time_entries_delete_own" on public.time_entries
  for delete using ((select auth.uid()) = user_id);

-- ============================================================
-- Roll-up view: totals per project (security_invoker => RLS enforced)
-- ============================================================
create or replace view public.project_rollups
with (security_invoker = on) as
select
  p.id                                        as project_id,
  p.user_id                                   as user_id,
  p.name                                      as project_name,
  count(distinct t.id)                        as task_count,
  count(te.id)                                as entry_count,
  coalesce(sum(te.duration_seconds), 0)       as total_seconds,
  coalesce(sum(te.duration_seconds) filter (where te.is_billable), 0) as billable_seconds
from public.projects p
left join public.tasks t        on t.project_id = p.id
left join public.time_entries te on te.task_id = t.id and te.ended_at is not null
group by p.id, p.user_id, p.name;

-- Roll-up view: totals per task
create or replace view public.task_rollups
with (security_invoker = on) as
select
  t.id                                        as task_id,
  t.user_id                                   as user_id,
  t.project_id                                as project_id,
  t.name                                      as task_name,
  count(te.id)                                as entry_count,
  coalesce(sum(te.duration_seconds), 0)       as total_seconds,
  max(te.started_at)                          as last_tracked_at
from public.tasks t
left join public.time_entries te on te.task_id = t.id and te.ended_at is not null
group by t.id, t.user_id, t.project_id, t.name;
