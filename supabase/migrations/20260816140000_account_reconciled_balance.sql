-- Reconciliation checkpoint: store the verified closing balance alongside the
-- date it was reconciled through. Together (reconciled_through, reconciled_balance)
-- is the last trusted point on the account. The next reconcile measures FORWARD
-- from this checkpoint over one closed cycle, instead of walking all the way back
-- from today's balance (which an open month can poison).
alter table public.accounts add column reconciled_balance numeric;
