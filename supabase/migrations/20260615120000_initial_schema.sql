-- Finance Tracker — initial schema
-- Personal cash-flow tracker for an international student in the USA.
-- Mirrors the structure of the source Excel workbook
-- (Expense Tracker, India Transfers, Summary & Balances, Credit Card Purchases)
-- but normalized into a relational, per-user, RLS-protected model.
--
-- Conventions (borrowed from the reference Summer Planner app):
--   * money            -> numeric(12,2)  (exact decimal, never float)
--   * rates / percents -> numeric(5,4) or numeric(10,5)
--   * primary keys     -> uuid default gen_random_uuid()  (needs pgcrypto)
--   * every table      -> user_id uuid references auth.users on delete cascade
--   * RLS              -> enabled with auth.uid() = user_id policies
--   * enum-like sets   -> text + CHECK constraints (not Postgres enums)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- settings (one row per user)
-- ---------------------------------------------------------------------------
create table public.settings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users (id) on delete cascade,
  currency            text not null default 'USD',
  -- Total starting bank balance ("Total Funds Available" in the workbook).
  -- Drives the opening-balance chain and the monthly budget.
  starting_funds      numeric(12,2) not null default 0,
  -- Monthly budget = starting_funds / budget_months (workbook used 12).
  budget_months       integer not null default 12 check (budget_months > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- accounts ("Transaction Mode" in the workbook)
-- ---------------------------------------------------------------------------
create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  name                  text not null,
  bank                  text not null default 'Other',
  type                  text not null default 'checking'
                          check (type in ('checking','credit_card','debit_card','savings','cash')),
  opening_balance       numeric(12,2) not null default 0,
  -- Credit cards carry a liability: their balance counts negatively in net worth.
  is_credit             boolean not null default false,
  include_in_net_worth  boolean not null default true,
  display_order         integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, name)
);

create index accounts_user_idx on public.accounts (user_id, display_order);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- categories (expense categories; workbook dropdown D2:D17)
-- ---------------------------------------------------------------------------
create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  -- OKLCH hue (0-360) used to color charts/dots consistently.
  color_hue      integer,
  -- Optional per-category annual budget (workbook had none; offered for the future).
  annual_budget  numeric(12,2),
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (user_id, name)
);

create index categories_user_idx on public.categories (user_id, display_order);

-- ---------------------------------------------------------------------------
-- inflow_types (workbook dropdown H2:H7)
-- ---------------------------------------------------------------------------
create table public.inflow_types (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  -- Whether transactions of this type count as a "paycheck" (workbook: "PayCheck").
  is_paycheck    boolean not null default false,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- debtors (people who owe the user money — splits / reimbursables)
-- ---------------------------------------------------------------------------
create table public.debtors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create trigger debtors_set_updated_at
  before update on public.debtors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions (core ledger; workbook Expense Tracker month tables)
-- ---------------------------------------------------------------------------
create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  txn_date        date not null,
  account_id      uuid not null references public.accounts (id) on delete restrict,
  category_id     uuid references public.categories (id) on delete set null,
  description     text not null,
  direction       text not null check (direction in ('outflow','inflow')),
  -- Always stored as a positive magnitude; `direction` carries the sign.
  amount          numeric(12,2) not null check (amount >= 0),
  inflow_type_id  uuid references public.inflow_types (id) on delete set null,
  -- "Whose Expense?" — only meaningful for outflows.
  whose_expense   text check (whose_expense in ('My','Friend','Group','Roommates')),
  -- Optional attribution of a split outflow / reimbursement inflow to a person.
  debtor_id       uuid references public.debtors (id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- inflow_type only applies to inflows; whose_expense only to outflows.
  constraint transactions_inflow_type_only_on_inflow
    check (direction = 'inflow' or inflow_type_id is null),
  constraint transactions_whose_expense_only_on_outflow
    check (direction = 'outflow' or whose_expense is null)
);

create index transactions_user_date_idx on public.transactions (user_id, txn_date);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_category_idx on public.transactions (category_id);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- india_transfers (USD <-> INR with effective FX rate)
-- ---------------------------------------------------------------------------
create table public.india_transfers (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  transfer_date      date not null,
  direction          text not null check (direction in ('received','sent')),
  description        text not null,
  -- Free-text endpoint: "BofA Checking", "To USC", "To Dixit", ...
  endpoint           text,
  usd_amount         numeric(12,2) not null check (usd_amount > 0),
  inr_amount         numeric(14,2) not null check (inr_amount > 0),
  -- Effective rate = INR per USD (workbook formula R8). Stored, generated.
  effective_fx_rate  numeric(10,5)
                       generated always as (round(inr_amount / nullif(usd_amount, 0), 5)) stored,
  notes              text,
  created_at         timestamptz not null default now()
);

create index india_transfers_user_date_idx on public.india_transfers (user_id, transfer_date);

-- ---------------------------------------------------------------------------
-- other_income (cashback income lines & other sources — workbook Table1)
-- ---------------------------------------------------------------------------
create table public.other_income (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  label          text not null,
  amount         numeric(12,2) not null,
  received_date  date,
  created_at     timestamptz not null default now()
);

create index other_income_user_idx on public.other_income (user_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security: every table is private to its owner.
-- ---------------------------------------------------------------------------
alter table public.settings           enable row level security;
alter table public.accounts           enable row level security;
alter table public.categories         enable row level security;
alter table public.inflow_types       enable row level security;
alter table public.debtors            enable row level security;
alter table public.transactions       enable row level security;
alter table public.india_transfers    enable row level security;
alter table public.other_income       enable row level security;

create policy settings_own           on public.settings           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy accounts_own           on public.accounts           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy categories_own         on public.categories         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy inflow_types_own       on public.inflow_types       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy debtors_own            on public.debtors            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy transactions_own       on public.transactions       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy india_transfers_own    on public.india_transfers    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy other_income_own       on public.other_income       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
