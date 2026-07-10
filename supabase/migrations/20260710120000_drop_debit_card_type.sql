-- Retire the "debit_card" account type. A debit card isn't a separate pot of
-- money - it spends straight from checking - so debit purchases are logged
-- against the checking account instead. Any existing debit-card accounts and
-- their transactions were migrated into checking before this ran, so no rows
-- carry type = 'debit_card' anymore.
alter table public.accounts
  drop constraint if exists accounts_type_check;

alter table public.accounts
  add constraint accounts_type_check
  check (type in ('checking', 'credit_card', 'savings', 'cash', 'investment'));
