-- Classify each category for 50/30/20 budgeting: needs / wants / savings.
alter table public.categories
  add column budget_group text check (budget_group in ('needs', 'wants', 'savings'));
