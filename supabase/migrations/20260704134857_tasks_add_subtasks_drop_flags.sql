-- Remove completion + billability logic from tasks; add self-referencing
-- parent_id for nested subtasks with cascading delete.

alter table public.tasks drop column if exists is_done;
alter table public.tasks drop column if exists is_billable;

alter table public.tasks
  add column parent_id uuid references public.tasks(id) on delete cascade;

create index tasks_parent_id_idx on public.tasks (parent_id);
