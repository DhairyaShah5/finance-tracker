-- How many people a Group/Roommates expense is split between (including you),
-- so only your share counts as your real expense.
alter table public.transactions
  add column split_count integer check (split_count is null or split_count >= 1);
