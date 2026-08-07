-- Debt-free goal on the Yearly Journey page. birth_date + target age let the app
-- compute the deadline (birthday at that age) and how much true net worth must
-- grow each month to reach $0 by then. Backfilled to the known birthdate; target
-- defaults to 25. Both editable in Settings.
alter table public.settings
  add column birth_date date,
  add column debt_free_target_age integer not null default 25;

update public.settings set birth_date = '2003-09-05' where birth_date is null;
