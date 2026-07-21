# Finance Tracker

A production-grade personal finance web app. Every dollar across banks, cards, cash, savings, and a brokerage is derived from **one immutable transaction ledger**, and the books reconcile to the cent. It is the live successor to a sprawling `Final_Dynamic_Finance_Tracker.xlsx` workbook, rebuilt as a typed, server-rendered application.

**Live (public, read-only):** https://finances-mango.vercel.app

## Why it's more than a CRUD app

- **One ledger, everything derived.** [`src/lib/calc.ts`](src/lib/calc.ts) is a pure, side-effect-free engine (~30 functions) that turns raw transaction rows into every metric the UI shows: net worth, spending, budgets, cash flow, FX. Nothing is precomputed in the database, so nothing can drift out of sync, and the whole domain is unit-testable in isolation.
- **Accounting-grade reconciliation.** `reconcile()` proves a cash identity — `income − spending − savings − owed back − unreconciled = net worth` — so the "How your balance adds up" card foots to the cent, like a double-entry check. Any residual is surfaced honestly on its own line instead of being smeared into spending.
- **Real-life money modeling.** Split expenses (even split or an explicit share), reimbursements (partial / installment, delete-reversal, and write-off), refunds that net against their category, category-linked savings destinations, and back-solved opening balances so you just type your real balance and the ledger reproduces it.
- **Secure by construction.** Row-Level Security on every table, plus a single-owner + public-read-only access model.

## Features

- **Dashboard** — available funds and net worth, income (with a source-breakdown modal) / spent / saved / owed KPIs, balance-over-time, spending-by-category donut, monthly spending vs budget, monthly surplus/deficit (net cash flow), and an interactive drill-down spending treemap.
- **Transactions** — the full ledger: month-grouped, searchable and filterable by account/category/type, add/edit/delete, splits, reimbursements, refunds, transfers, and the reconciliation card.
- **Insights** — month-by-month breakdown with inline category and 50/30/20 reassignment.
- **Budget** — 50/30/20 needs/wants/savings, plus per-category budgets learned from your recent spend.
- **Accounts** — live balances across every account, net-worth toggle, transfers, and an assets-composition donut.
- **India Transfers** — USD↔INR remittances with a Postgres-generated effective FX rate, weighted averages, and a rate-over-time chart.
- **Debtors** — track who owes you; settle in cash (books an excluded inflow) or in kind.
- **Settings** — starting funds, budget horizon, savings target, and manage the category & income-type lists.

## Tech

**Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript** (strict) · **Tailwind CSS v4** · shadcn-style components on **Radix UI** · **Supabase** (Postgres + Auth + Row-Level Security) via `@supabase/ssr` · **Recharts** · **Zod** · **sonner** · **next-themes** · deployed on **Vercel**.

Reads are React Server Components; every mutation is a Zod-validated **Server Action**. There is no client-side data-fetching library and no bespoke REST layer to keep in sync.

## Architecture

- **Domain core** — [`src/lib/calc.ts`](src/lib/calc.ts): the pure derivation engine (`reconcile`, `myAmount`, `monthlyCashFlow`, `categoryTotals`, `monthlyBudgetStatus`, `accountActivity`, `fxSummary`, …). [`src/lib/defaults.ts`](src/lib/defaults.ts) holds the canonical seed lists; [`src/lib/setup.ts`](src/lib/setup.ts) idempotently provisions a new user on first login.
- **Data flow** — each page is a Server Component that authenticates, fetches its rows in one `Promise.all`, runs `calc.ts`, and renders. Writes go through `actions.ts` Server Actions per route, each re-checking `auth.getUser()` and validating with Zod, then `revalidatePath`.
- **Auth & access** — Supabase email + password with a PKCE / OTP confirmation route (`src/app/auth/confirm`). `src/proxy.ts` (Next.js 16's renamed middleware) refreshes the session cookie each request. A signed-in owner gets full edit access via an RLS-scoped client; anonymous visitors get a service-role client scoped to the owner's `user_id` and a read-only banner, so the live app is publicly browsable but never editable by others.
- **Database** — 8 tables (`settings`, `accounts`, `categories`, `inflow_types`, `debtors`, `transactions`, `india_transfers`, `other_income`) with RLS `*_own` policies (`auth.uid() = user_id`), CHECK constraints, `updated_at` triggers, a generated FX column, and self-referential linking for reimbursements. The schema evolved through **15 versioned migrations**.
- **Design system** — a hand-authored OKLCH "Aurora" palette (indigo → violet → cyan), theme-aware light/dark via `next-themes`, with layered glassy surfaces and financial semantics (positive / negative / warning) kept separate from the brand accent.

## Getting started

### 1. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com). From **Project → Settings → API** copy the project URL, the `anon` public key, and the `service_role` key.

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SITE_URL`.

### 3. Apply the database schema

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 4. Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, create an account, and sign in. Your default accounts, categories, and income types are seeded automatically on first login.

## Deploy to Vercel

1. Push to GitHub and import the repo in Vercel.
2. Add the same environment variables in the Vercel project settings (set `NEXT_PUBLIC_SITE_URL` to your production URL).
3. In Supabase **Authentication → URL Configuration**, add your Vercel URL to the allowed redirect URLs.

Pushes to `main` auto-deploy; schema changes ship via `supabase db push`.

## Project structure

```
src/
  app/
    (app)/                Authenticated app shell (sidebar + read-only banner)
      page.tsx            Dashboard
      transactions/       Ledger, CRUD, reimbursements, reconciliation
      insights/           Monthly breakdown
      budget/             50/30/20 + learned per-category budgets
      accounts/           Accounts, balances, transfers
      india/              India transfers (FX)
      debtors/            Money owed / settle up
      settings/           Budget prefs + manage lists
    login/                Email/password auth
    auth/                 Confirm + sign-out route handlers
  components/             Charts, money, stat cards, sidebar, shadcn ui/, custom viz
  lib/
    calc.ts               Pure derivation engine (the domain core)
    defaults.ts           Canonical seed lists
    setup.ts              Idempotent first-run provisioning
    queries.ts            Owner resolution + requireUser()
    database.types.ts     Generated Postgres types
    supabase/             server / proxy / service clients (@supabase/ssr)
  proxy.ts                Session refresh (Next 16 middleware)
supabase/migrations/      15 versioned schema migrations
```
