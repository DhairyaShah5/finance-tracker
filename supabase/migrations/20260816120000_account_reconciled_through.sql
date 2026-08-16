-- Bank reconciliation stamp. The statement closing date this account was last
-- verified against, i.e. the ledger matched the bank statement to the cent on
-- this date. Set automatically when a reconciliation check passes on the
-- /accounts/reconcile screen (only advanced forward, never rolled back).
-- Nullable: null means the account has never been reconciled yet.
alter table public.accounts
  add column reconciled_through date;
