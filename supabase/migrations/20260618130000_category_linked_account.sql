-- A category can designate a destination account. An expense in that category is
-- understood as money moving OUT of the source account and INTO the linked one
-- (e.g. "Investment" -> RobinHood, "Tuition Vault" -> Marcus HYSA). The deposit
-- is still logged as a single savings expense; the linked account's balance is
-- derived from it, so it grows without a separate transfer.
alter table public.categories
  add column linked_account_id uuid references public.accounts (id) on delete set null;
