# Finance Tracker

A personal cash-flow, budget, and rewards tracker — the online version of the
`Final_Dynamic_Finance_Tracker.xlsx` workbook. Built with Next.js 16, React 19,
Supabase, Tailwind v4, and shadcn/ui in a clean "Nordic SaaS" style.

## Features

- **Dashboard** — available funds, monthly net spending vs budget, balance trend,
  spending by category, recent activity.
- **Transactions** — the full ledger (money in/out) with search and filters by
  month, account, category, and type. Full add / edit / delete.
- **Accounts** — per-account balances and activity (BofA / Chase checking, credit,
  debit, etc.), balance composition.
- **India Transfers** — USD ↔ INR transfers with effective FX rate and rate trend.
- **Debtors** — track money fronted for friends/roommates and reimbursements owed.
- **Settings** — starting funds, budget, and manage categories & income types.

## Tech

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui (Radix) · Supabase (Postgres + Auth, RLS) · TanStack Query · Recharts ·
react-hook-form + Zod · sonner.

## Getting started

### 1. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com). From
**Project → Settings → API** copy the project URL, the `anon` public key, and the
`service_role` key.

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SITE_URL`.

### 3. Apply the database schema

Link the CLI and push the migration (or paste
`supabase/migrations/20260615120000_initial_schema.sql` into the Supabase SQL editor):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 4. Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, create an account, and sign in. Your default
accounts, categories, and income types are seeded automatically on first login.

### 5. Load your initial data (one-time)

Seed your transactions, India transfers, and starting funds from the source
workbook once (uses the service-role key, bypasses RLS). Create your account in
the app first, then run:

```bash
SEED_EMAIL=you@example.com npx tsx scripts/seed-from-xlsx.ts
```

After this one-time load, all further data is managed directly in the app.

## Deploy to Vercel

1. Push to GitHub and import the repo in Vercel.
2. Add the same environment variables in the Vercel project settings (set
   `NEXT_PUBLIC_SITE_URL` to your production URL).
3. In Supabase **Authentication → URL Configuration**, add your Vercel URL to the
   allowed redirect URLs.

## Project structure

```
src/
  app/
    (app)/            Authenticated app (sidebar shell)
      page.tsx        Dashboard
      transactions/   Ledger + CRUD
      accounts/       Accounts & balances
      india/          India transfers (FX)
      debtors/        Money owed / splits
      settings/       Budget + manage lists
    login/            Email/password auth
    auth/             Confirm + sign-out route handlers
  components/         Shared UI (charts, money, stat-card, sidebar, shadcn ui/)
  lib/
    calc.ts           Pure derivation engine (summaries, balances, FX, cashback)
    import-parse.ts   Excel workbook parser
    import-apply.ts   Apply parsed data into the DB
    supabase/         Browser / server / proxy clients
  proxy.ts            Auth wall (Next 16 middleware)
supabase/migrations/  Database schema
scripts/              Dev seed + verification
```
