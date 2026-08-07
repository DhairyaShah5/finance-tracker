-- Let a transfer be excluded from the net-worth / debt math while it stays in the
-- raw ledger. Used when received money is not tracked in any US account (for
-- example a CD held outside the app): excluding it keeps true net worth honest,
-- since it is neither an asset in net worth nor should it count as debt. Defaults
-- to included, matching the prior behavior.
alter table public.india_transfers
  add column exclude_from_net_worth boolean not null default false;
