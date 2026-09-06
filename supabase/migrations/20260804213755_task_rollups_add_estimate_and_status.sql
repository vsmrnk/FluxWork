-- Additive: keep the existing columns in order, append planning fields so
-- budget-vs-actual is a single read.
create or replace view public.task_rollups as
  select
    t.id                                              as task_id,
    t.user_id,
    t.project_id,
    t.name                                            as task_name,
    count(te.id)                                      as entry_count,
    coalesce(sum(te.duration_seconds), 0::bigint)     as total_seconds,
    max(te.started_at)                                as last_tracked_at,
    t.estimate_seconds,
    t.status,
    t.parent_id,
    t.sort_order
  from public.tasks t
  left join public.time_entries te
    on te.task_id = t.id and te.ended_at is not null
  group by t.id, t.user_id, t.project_id, t.name,
           t.estimate_seconds, t.status, t.parent_id, t.sort_order;
