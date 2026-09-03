-- Split one expense across several people. Until now a fronted/split expense
-- could name a single debtor (transactions.debtor_id): the whole receivable went
-- to one person. A shared bill often involves more than one, and some of them
-- aren't on your Debtors list yet.
--
-- transaction_debtors is a junction: one row per person who owes you on a given
-- transaction, carrying THAT person's share and how much they've paid back. The
-- whole-transaction receivable is unchanged and stays the single source of truth
-- for every aggregate (dashboard "owed", net worth, the reconciliation, Excel):
--   your own share      -> transactions.my_share      (so myAmount() is unchanged)
--   total still owed     = amount - my_share - reimbursed_amount   (reimbursable)
--   reimbursed_amount    = SUM(transaction_debtors.settled_amount) on the txn
-- The junction only SPLITS that receivable by person for the People page; it
-- never changes the totals. A single-person Friend expense keeps using
-- transactions.debtor_id (no junction row), so the old flow is untouched.

create table public.transaction_debtors (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  debtor_id      uuid not null references public.debtors (id) on delete cascade,
  -- What this person owes you on this transaction (their slice of the bill).
  share          numeric(12,2) not null default 0,
  -- How much of their share has been paid back (partial settlement support).
  settled_amount numeric(12,2) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One row per person per transaction.
  unique (transaction_id, debtor_id)
);

create trigger transaction_debtors_set_updated_at
  before update on public.transaction_debtors
  for each row execute function public.set_updated_at();

alter table public.transaction_debtors enable row level security;

create policy transaction_debtors_own on public.transaction_debtors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index transaction_debtors_txn_idx
  on public.transaction_debtors (transaction_id);

create index transaction_debtors_debtor_idx
  on public.transaction_debtors (debtor_id);

create index transaction_debtors_user_idx
  on public.transaction_debtors (user_id);
