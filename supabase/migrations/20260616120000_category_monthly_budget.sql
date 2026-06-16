-- Per-category monthly spending budget (null = no budget set).
alter table public.categories
  add column monthly_budget numeric(12,2) check (monthly_budget is null or monthly_budget >= 0);
