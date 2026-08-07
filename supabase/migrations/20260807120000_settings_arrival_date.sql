-- Arrival date in the US. Anchors the Yearly Journey page: journey "years" run
-- from this date (not the calendar year), so today rolls into the next year on
-- the anniversary. Nullable, so the app falls back to the earliest transaction
-- when it is unset. Backfilled to the known arrival date and editable in
-- Settings.
alter table public.settings
  add column arrival_date date;

update public.settings set arrival_date = '2025-08-06' where arrival_date is null;
