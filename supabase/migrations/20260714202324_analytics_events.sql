-- G1 · Minimal funnel events. One row per tracked event. No BI/dashboards —
-- counts are read with simple SQL (e.g. count(distinct user_id) per event).
-- Events instrumented: signup, activation (first billable entry),
-- invoice_generated, upgrade.
create table if not exists public.analytics_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event      text not null check (length(trim(event)) > 0),
  props      jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_idx
  on public.analytics_events (event, user_id);

-- Fast "has this user already fired this singleton event?" lookups (activation).
create index if not exists analytics_events_user_event_idx
  on public.analytics_events (user_id, event);

alter table public.analytics_events enable row level security;

-- Owner-only: a user may record and read their own events. No update/delete.
create policy analytics_events_insert_own on public.analytics_events
  for insert to authenticated with check (user_id = auth.uid());
create policy analytics_events_select_own on public.analytics_events
  for select to authenticated using (user_id = auth.uid());
