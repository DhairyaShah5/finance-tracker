-- Creditors: the mirror of debtors. A debtor is someone who owes YOU (a
-- receivable, derived from reimbursable expenses you fronted). A creditor is
-- someone YOU owe - money you took from a friend that you'll pay back.
--
-- Like debtors, a creditor's balance is DERIVED from the ledger, never
-- hand-typed. The debt is created by the transaction that put you in it:
--   "cash"   -> the friend sent money into one of your accounts. Booked as an
--               excluded inflow (is_transfer, creditor_id set): it raises your
--               balance but isn't income, and it's owed back.
--   "in_kind"-> the friend paid for something of yours directly. No cash reached
--               you, so it's a net-zero pair on an account: the borrow-inflow
--               (creates the liability) plus your own categorized expense-outflow
--               (the thing you consumed). Balance nets to zero; spending is real.
-- Paying a creditor back is an outflow linked to the borrow via repays_id, which
-- bumps the borrow's repaid_amount so the outstanding payable shrinks to zero.

create table public.creditors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create trigger creditors_set_updated_at
  before update on public.creditors
  for each row execute function public.set_updated_at();

alter table public.creditors enable row level security;

create policy creditors_own on public.creditors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The liability mirror of debtor_id / reimbursed_amount / reimburses_id.
--   creditor_id   groups a transaction under the person you owe.
--   repaid_amount tracks how much of a borrow you've paid back (partial support).
--   repays_id     links a repayment outflow back to the borrow inflow it settles,
--                 so deleting the repayment restores the debt and deleting the
--                 borrow cascades to remove its repayments.
alter table public.transactions
  add column creditor_id   uuid references public.creditors (id) on delete set null,
  add column repaid_amount numeric not null default 0,
  add column repays_id     uuid references public.transactions (id) on delete cascade;

create index transactions_creditor_id_idx
  on public.transactions (creditor_id)
  where creditor_id is not null;

create index transactions_repays_id_idx
  on public.transactions (repays_id)
  where repays_id is not null;
