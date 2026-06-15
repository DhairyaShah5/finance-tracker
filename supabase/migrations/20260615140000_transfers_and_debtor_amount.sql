-- Inter-account transfers + explicit debtor amounts.

-- Mark a transaction as an internal transfer between the user's own accounts.
-- Transfers stay in the ledger but are excluded from income / spending / budget
-- / balance metrics (they just move money around, they aren't earning/spending).
alter table public.transactions
  add column is_transfer boolean not null default false;

create index transactions_is_transfer_idx
  on public.transactions (user_id, is_transfer);

-- Debtors now carry an explicit outstanding amount the user manages directly
-- (rather than deriving "owed to me" from every split transaction).
alter table public.debtors
  add column amount numeric(12,2) not null default 0;
