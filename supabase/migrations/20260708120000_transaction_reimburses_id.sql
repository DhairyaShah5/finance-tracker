-- Link a reimbursement inflow back to the reimbursable expense it pays off.
-- Only reimbursement inflows carry this (set by markReimbursed); every other
-- transaction leaves it null. With the link in place, deleting a reimbursement
-- inflow can roll back the expense's `reimbursed_amount`, and deleting the
-- expense cascades to remove its reimbursement inflows so the books stay square.
alter table public.transactions
  add column reimburses_id uuid references public.transactions(id) on delete cascade;

create index if not exists transactions_reimburses_id_idx
  on public.transactions (reimburses_id)
  where reimburses_id is not null;
