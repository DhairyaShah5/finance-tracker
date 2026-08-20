-- Per-account "hide from the app" switch. A hidden account still owns its
-- transactions (the rows stay in the ledger so nothing breaks), but it vanishes
-- from every displayed number: net worth, total wealth, spending, income,
-- budget, category and cash-flow charts all compute as if the account - and its
-- transactions - aren't there. Distinct from include_in_net_worth, which keeps
-- the account visible but out of the net-worth total.
alter table public.accounts
  add column hidden boolean not null default false;
