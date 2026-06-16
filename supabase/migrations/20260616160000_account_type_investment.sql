-- Allow an "investment" account type (e.g. a RobinHood brokerage balance) so it
-- can be tracked as an asset alongside cash/checking/savings.
alter table public.accounts
  drop constraint if exists accounts_type_check;

alter table public.accounts
  add constraint accounts_type_check
  check (type in ('checking', 'credit_card', 'debit_card', 'savings', 'cash', 'investment'));
