-- ============================================================
-- Time Tracking core schema: Project -> Task -> Time Entry
-- Auth-scoped (Supabase Auth) with RLS. Overlap-friendly,
-- accurate roll-ups via generated duration column.
-- ============================================================

-- Shared trigger to maintain updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------
-- projects
-- ---------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  client      text,
  code        text,
  color       text not null default '#111111',
  is_billable boolean not null default true,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_user_id_idx on public.projects (user_id);
create index projects_active_idx  on public.projects (user_id) where is_archived = false;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- tasks
-- ---------------------------------------------------------
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  is_billable boolean not null default true,
  is_done     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_user_id_idx    on public.tasks (user_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- time_entries
--   * ended_at NULL  => currently running timer
--   * overlapping entries are explicitly permitted (no exclusion constraint)
--   * duration_seconds is a generated column for accurate roll-ups
-- ---------------------------------------------------------
create table public.time_entries (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.tasks(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  notes            text,
  is_billable      boolean not null default true,
  duration_seconds integer generated always as (
    case
      when ended_at is null then null
      else greatest(0, floor(extract(epoch from (ended_at - started_at)))::integer)
    end
  ) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint time_entries_valid_range check (ended_at is null or ended_at >= started_at)
);

create index time_entries_task_id_idx    on public.time_entries (task_id);
create index time_entries_user_id_idx    on public.time_entries (user_id);
create index time_entries_started_at_idx on public.time_entries (user_id, started_at desc);
-- Fast lookup of running timers
create index time_entries_running_idx    on public.time_entries (user_id) where ended_at is null;

create trigger time_entries_set_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();
