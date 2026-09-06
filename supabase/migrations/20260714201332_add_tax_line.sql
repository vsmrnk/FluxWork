-- D5 · Single tax line (label + rate) at the client level, snapshotted onto invoices.
-- Money stays numeric (never float). tax_rate is a percentage (e.g. 20.00 = 20%).
-- tax_amount is round2(subtotal * tax_rate / 100), snapshotted so historical
-- invoices never move when a client's tax settings change later.

alter table public.clients
  add column if not exists tax_label text,
  add column if not exists tax_rate  numeric(6,3) not null default 0
    check (tax_rate >= 0 and tax_rate <= 100);

alter table public.invoices
  add column if not exists tax_label  text,
  add column if not exists tax_rate   numeric(6,3) not null default 0
    check (tax_rate >= 0 and tax_rate <= 100),
  add column if not exists tax_amount numeric(14,2) not null default 0
    check (tax_amount >= 0);
