-- 50/30/20 classification is per-transaction (you decide each one), not per
-- category. Backfill from the old category-level guesses as a starting point.
alter table public.transactions
  add column budget_group text check (budget_group in ('needs', 'wants', 'savings'));

update public.transactions t
set budget_group = c.budget_group
from public.categories c
where t.category_id = c.id
  and t.direction = 'outflow'
  and c.budget_group is not null;
