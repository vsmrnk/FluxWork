-- Epic E · Monetization (Paddle Billing).
-- Subscription state per user + a webhook idempotency ledger.
-- Money-free table; timestamps are timestamptz UTC. RLS: owner may SELECT own
-- subscription row only. Writes happen exclusively via the service-role client
-- in the Paddle webhook handler (service role bypasses RLS), so there are no
-- INSERT/UPDATE policies for regular users.

create table if not exists public.subscriptions (
  user_id                uuid primary key
                           references auth.users(id) on delete cascade
                           default auth.uid(),
  paddle_customer_id     text,
  paddle_subscription_id text,
  status                 text not null default 'free'
                           check (status in ('free','active','past_due','canceled')),
  plan                   text,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Fast lookup when a webhook can only match by Paddle customer id.
create index if not exists subscriptions_paddle_customer_id_idx
  on public.subscriptions (paddle_customer_id);
create index if not exists subscriptions_paddle_subscription_id_idx
  on public.subscriptions (paddle_subscription_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

-- Owner can read their own subscription row. No write policies: only the
-- service role (webhooks) mutates this table.
create policy "subscriptions_select_own"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

-- Webhook idempotency ledger: dedupe Paddle events on their event id. Only the
-- service role touches this table, so RLS is enabled with no policies (deny-all
-- to anon/authenticated).
create table if not exists public.paddle_events (
  event_id     text primary key,
  event_type   text,
  processed_at timestamptz not null default now()
);

alter table public.paddle_events enable row level security;
