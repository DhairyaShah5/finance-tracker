-- Mark a category as "one-off / no budget": it's excluded from the learned
-- budget allocation and always shown without a monthly budget (like Travelling).
-- Use for catch-all categories (e.g. Miscellaneous) whose spend is irregular and
-- shouldn't be tracked against a target.
alter table public.categories
  add column no_budget boolean not null default false;
