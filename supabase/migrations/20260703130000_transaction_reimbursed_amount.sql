-- Partial / installment reimbursements. `reimbursed_amount` tracks how much of a
-- reimbursable expense has been paid back so far, so a reimbursement can arrive in
-- pieces (or only partly). `reimbursed` stays as a convenience flag that flips true
-- once the full owed amount has come back.
alter table public.transactions
  add column reimbursed_amount numeric not null default 0;
