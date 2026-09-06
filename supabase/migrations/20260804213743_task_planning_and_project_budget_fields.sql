-- Task planning metadata: estimates, descriptions, ordering, status, dates.
alter table public.tasks
  add column if not exists description     text,
  add column if not exists estimate_seconds integer
    check (estimate_seconds is null or estimate_seconds >= 0),
  add column if not exists sort_order      integer not null default 0,
  add column if not exists status          text    not null default 'open'
    check (status in ('open', 'in_progress', 'done')),
  add column if not exists priority        text
    check (priority is null or priority in ('low', 'normal', 'high')),
  add column if not exists due_date        date,
  add column if not exists completed_at    timestamptz;

comment on column public.tasks.estimate_seconds is
  'Planned effort in whole seconds. NULL = unestimated. Compare against task_rollups.total_seconds for budget-vs-actual.';
comment on column public.tasks.sort_order is
  'Manual ordering within a parent (drag and drop). Ties break on created_at.';
comment on column public.tasks.status is
  'open | in_progress | done. completed_at is set when status becomes done.';

-- Project-level budget, so the overview can show budget burn independent of
-- per-task estimates.
alter table public.projects
  add column if not exists budget_seconds integer
    check (budget_seconds is null or budget_seconds >= 0),
  add column if not exists budget_amount  numeric
    check (budget_amount is null or budget_amount >= 0),
  add column if not exists notes          text,
  add column if not exists starts_on      date,
  add column if not exists ends_on        date;

comment on column public.projects.budget_seconds is
  'Optional time budget for the whole project, in whole seconds.';
comment on column public.projects.budget_amount is
  'Optional money budget for the whole project, in the client currency.';

-- Ordering index for the task board.
create index if not exists tasks_project_sort_idx
  on public.tasks (project_id, sort_order, created_at);
