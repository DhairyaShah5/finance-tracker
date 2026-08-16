-- Reconciliation history: one durable row per statement you reconcile, so there
-- is a lasting record of what was checked, when, and how it landed. The account
-- still carries its latest checkpoint (reconciled_through / reconciled_balance);
-- this table is the log behind it. Upsert on (user_id, account_id, as_of_date)
-- so re-reconciling a statement updates its record instead of duplicating it.
create table public.account_reconciliations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  account_id         uuid not null references public.accounts (id) on delete cascade,
  as_of_date         date not null,
  statement_balance  numeric(12,2) not null,
  ledger_balance     numeric(12,2),          -- what the ledger computed (null for a pure attest)
  difference         numeric(12,2),          -- ledger - statement (null for a pure attest)
  method             text not null default 'matched'
                       check (method in ('matched','attested')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, account_id, as_of_date)
);

create index account_reconciliations_user_idx
  on public.account_reconciliations (user_id, account_id, as_of_date desc);

create trigger account_reconciliations_set_updated_at
  before update on public.account_reconciliations
  for each row execute function public.set_updated_at();

alter table public.account_reconciliations enable row level security;
create policy account_reconciliations_own on public.account_reconciliations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
