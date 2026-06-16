-- Monthly savings target (USD) used to derive the affordable spending budget:
-- affordable = recent income - savings_target (floored at the runway allowance).
alter table public.settings
  add column savings_target numeric(12,2) not null default 0;
