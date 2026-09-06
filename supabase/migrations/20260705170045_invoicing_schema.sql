-- ============================================================================
-- Invoicing: uploaded DOCX templates, invoices, snapshotted line items
-- ----------------------------------------------------------------------------
-- Actual DOCX/PDF bytes live in Supabase Storage; these tables hold only the
-- storage paths + metadata. Line items snapshot description/hours/rate/amount
-- so a generated invoice is immutable even if projects/rates change later.
-- ============================================================================

-- 1. invoice_templates -------------------------------------------------------
create table public.invoice_templates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null check (length(trim(name)) > 0),
  -- Path within the private 'invoice-templates' Storage bucket (object key).
  storage_path      text not null,
  original_filename text,
  -- Placeholders detected in the uploaded .docx, e.g.
  -- ["{{client_name}}","{{total_amount}}"]; populated on upload, optional.
  placeholders      jsonb,
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index invoice_templates_user_id_idx on public.invoice_templates (user_id);

create trigger invoice_templates_set_updated_at
  before update on public.invoice_templates
  for each row execute function set_updated_at();

alter table public.invoice_templates enable row level security;

create policy invoice_templates_select_own on public.invoice_templates
  for select using ((select auth.uid()) = user_id);
create policy invoice_templates_insert_own on public.invoice_templates
  for insert with check ((select auth.uid()) = user_id);
create policy invoice_templates_update_own on public.invoice_templates
  for update using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);
create policy invoice_templates_delete_own on public.invoice_templates
  for delete using ((select auth.uid()) = user_id);

-- 2. invoices ----------------------------------------------------------------
create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- Restrict: refuse to delete a client that still has invoices (audit trail).
  client_id      uuid not null references public.clients (id) on delete restrict,
  -- Optional: an invoice may scope to one project or span several (then null).
  project_id     uuid references public.projects (id) on delete set null,
  template_id    uuid references public.invoice_templates (id) on delete set null,
  invoice_number text not null,
  status         text not null default 'draft'
                   check (status in ('draft', 'sent', 'paid', 'void')),
  currency       text not null default 'USD',
  -- Billing window the line items were pulled from.
  period_start   date,
  period_end     date,
  issued_date    date,
  due_date       date,
  subtotal       numeric(12, 2) not null default 0,
  total          numeric(12, 2) not null default 0,  -- subtotal (+ tax, later)
  notes          text,
  -- Generated artifacts in the private 'invoices' Storage bucket.
  docx_path      text,
  pdf_path       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Invoice numbers are unique per user, not globally.
  unique (user_id, invoice_number)
);

create index invoices_user_id_idx   on public.invoices (user_id);
create index invoices_client_id_idx on public.invoices (client_id);
create index invoices_status_idx    on public.invoices (user_id, status);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function set_updated_at();

alter table public.invoices enable row level security;

create policy invoices_select_own on public.invoices
  for select using ((select auth.uid()) = user_id);
create policy invoices_insert_own on public.invoices
  for insert with check ((select auth.uid()) = user_id);
create policy invoices_update_own on public.invoices
  for update using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);
create policy invoices_delete_own on public.invoices
  for delete using ((select auth.uid()) = user_id);

-- 3. invoice_line_items ------------------------------------------------------
-- Fully snapshotted: once written, these do not change if rates/tasks change.
create table public.invoice_line_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  -- Denormalized user_id lets RLS check ownership without a join to invoices.
  user_id     uuid not null references auth.users (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete set null,
  description text not null,
  hours       numeric(12, 4) not null,           -- 4dp: preserve sub-minute time
  rate        numeric(12, 2) not null,           -- effective rate, snapshotted
  amount      numeric(12, 2) not null,           -- round(hours * rate, 2)
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index invoice_line_items_invoice_id_idx
  on public.invoice_line_items (invoice_id);

alter table public.invoice_line_items enable row level security;

create policy invoice_line_items_select_own on public.invoice_line_items
  for select using ((select auth.uid()) = user_id);
create policy invoice_line_items_insert_own on public.invoice_line_items
  for insert with check ((select auth.uid()) = user_id);
create policy invoice_line_items_update_own on public.invoice_line_items
  for update using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);
create policy invoice_line_items_delete_own on public.invoice_line_items
  for delete using ((select auth.uid()) = user_id);

-- 4. Stamp time entries when invoiced ----------------------------------------
-- Prevents double-billing: generation pulls only billable, un-invoiced entries
-- and stamps them. on delete set null: deleting an invoice frees its entries.
alter table public.time_entries
  add column invoice_id uuid references public.invoices (id) on delete set null;

create index time_entries_invoice_id_idx
  on public.time_entries (invoice_id);

comment on column public.time_entries.invoice_id is
  'Set when the entry has been pulled onto an invoice; NULL = not yet billed.';
