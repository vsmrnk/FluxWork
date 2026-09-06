-- ============================================================================
-- Clients, per-project rate overrides, and task-level billability
-- ----------------------------------------------------------------------------
-- Rate model: layered. clients.default_rate is the fallback; projects.rate
-- overrides it when set. The *effective* rate is resolved at invoice time and
-- snapshotted onto invoice_line_items.rate (see next migration) so historical
-- invoices never change when a rate is later edited.
-- ============================================================================

-- 1. clients -----------------------------------------------------------------
create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  email        text,
  -- Fallback hourly rate for this client's projects. Nullable: not every
  -- client is billed hourly. numeric(12,2) = money, avoids float rounding.
  default_rate numeric(12, 2),
  currency     text not null default 'USD',
  address      text,          -- freeform block, rendered into the invoice header
  notes        text,
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index clients_user_id_idx on public.clients (user_id);

-- Reuse the shared, search-path-hardened trigger fn already in the schema.
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function set_updated_at();

-- RLS: owner-only, matching the projects/tasks/time_entries pattern exactly.
alter table public.clients enable row level security;

create policy clients_select_own on public.clients
  for select using ((select auth.uid()) = user_id);
create policy clients_insert_own on public.clients
  for insert with check ((select auth.uid()) = user_id);
create policy clients_update_own on public.clients
  for update using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);
create policy clients_delete_own on public.clients
  for delete using ((select auth.uid()) = user_id);

-- 2. projects: link to clients + optional rate override -----------------------
-- on delete set null: deleting a client detaches, never cascades away projects.
alter table public.projects
  add column client_id uuid references public.clients (id) on delete set null,
  add column rate      numeric(12, 2);  -- null => inherit client.default_rate

create index projects_client_id_idx on public.projects (client_id);

comment on column public.projects.rate is
  'Per-project hourly rate override. NULL inherits clients.default_rate.';

-- 3. Backfill: promote the existing free-text projects.client into real client
--    rows (one per distinct user_id + name), then wire up client_id.
--    The legacy projects.client text column is intentionally KEPT for now so
--    existing UI that reads it does not break; drop it in a later migration
--    once the UI reads client_id.
with distinct_clients as (
  select distinct user_id, trim(client) as name
  from public.projects
  where client is not null and trim(client) <> ''
), inserted as (
  insert into public.clients (user_id, name)
  select user_id, name from distinct_clients
  returning id, user_id, name
)
update public.projects p
set client_id = i.id
from inserted i
where p.user_id = i.user_id and trim(p.client) = i.name;

-- 4. tasks: task-level billability -------------------------------------------
-- New time entries inherit this as their default; each entry stays overridable
-- via the pre-existing time_entries.is_billable column.
alter table public.tasks
  add column is_billable boolean not null default true;

comment on column public.tasks.is_billable is
  'Default billability for new time entries on this task; entry-level flag wins.';
