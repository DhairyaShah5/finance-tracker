-- Optional explicit "your share" for an outflow. When set, it overrides the
-- even-split / whose-expense computation — e.g. you covered more than an even
-- split on a shared payment, so your real share is higher. Doesn't change the
-- transaction amount (and thus account balances), only how much counts as your
-- spending.
alter table public.transactions
  add column my_share numeric(12,2) check (my_share is null or my_share >= 0);
