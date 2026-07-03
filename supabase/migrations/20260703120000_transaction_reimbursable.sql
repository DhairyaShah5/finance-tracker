-- Reimbursable expenses: money you front that a company/employer (or anyone)
-- will pay back later. `reimbursable` keeps the expense out of your spending and
-- budget (your share is treated as 0, like a fronted expense) and carries it as a
-- receivable instead. `reimbursed` flips true when the money lands, which is done
-- by recording an excluded inflow into the account it arrived in.
alter table public.transactions
  add column reimbursable boolean not null default false,
  add column reimbursed boolean not null default false;
