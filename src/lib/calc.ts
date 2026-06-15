// Pure derivation engine — no I/O. Turns raw ledger rows into the metrics the
// UI renders. Mirrors the formulas in the source Excel workbook (see
// _research/08-excel-domain-model.md §4) but normalized and consistent.

import type {
  AccountRow,
  CategoryRow,
  DebtorRow,
  IndiaTransferRow,
  InflowTypeRow,
  SettingsRow,
  TransactionRow,
} from "@/lib/database.types";
import { monthKey, monthLabel } from "@/lib/format";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Signed cash amount: inflow positive, outflow negative. */
export function signed(t: Pick<TransactionRow, "direction" | "amount">): number {
  return t.direction === "inflow" ? t.amount : -t.amount;
}

// ---------------------------------------------------------------------------
// Monthly summaries — the Dashboard / closing-balance chain (Excel R1–R6)
// ---------------------------------------------------------------------------
export interface MonthlySummary {
  month: string; // 'YYYY-MM'
  label: string; // 'Aug 2025'
  totalExpenses: number;
  totalInflow: number;
  netSpending: number; // expenses − inflow  (can be negative)
  budget: number; // starting_funds / budget_months
  variance: number; // budget − netSpending  (positive = under budget)
  openingBalance: number;
  closingBalance: number;
}

export function monthlyBudget(settings: Pick<SettingsRow, "starting_funds" | "budget_months">): number {
  return settings.budget_months > 0
    ? round2(settings.starting_funds / settings.budget_months)
    : 0;
}

export function buildMonthlySummaries(
  txns: TransactionRow[],
  opts: { monthlyBudget: number; openingBalance: number },
): MonthlySummary[] {
  const budget = opts.monthlyBudget;
  const byMonth = new Map<string, { expenses: number; inflow: number }>();

  for (const t of txns) {
    if (t.is_transfer) continue; // internal transfers aren't income/spending
    const key = monthKey(t.txn_date);
    const bucket = byMonth.get(key) ?? { expenses: 0, inflow: 0 };
    if (t.direction === "outflow") bucket.expenses += t.amount;
    else bucket.inflow += t.amount;
    byMonth.set(key, bucket);
  }

  const months = [...byMonth.keys()].sort();
  let opening = opts.openingBalance;
  const out: MonthlySummary[] = [];

  for (const month of months) {
    const { expenses, inflow } = byMonth.get(month)!;
    const netSpending = round2(expenses - inflow);
    const closing = round2(opening - netSpending);
    out.push({
      month,
      label: monthLabel(month),
      totalExpenses: round2(expenses),
      totalInflow: round2(inflow),
      netSpending,
      budget,
      variance: round2(budget - netSpending),
      openingBalance: round2(opening),
      closingBalance: closing,
    });
    opening = closing;
  }
  return out;
}

/** Running available funds = starting_funds + Σ signed (Excel closing balance). */
export function runningBalance(
  txns: TransactionRow[],
  settings: Pick<SettingsRow, "starting_funds">,
  uptoDate?: string,
): number {
  let bal = settings.starting_funds;
  for (const t of txns) {
    if (t.is_transfer) continue; // transfers move money between own accounts
    if (uptoDate && t.txn_date > uptoDate) continue;
    bal += signed(t);
  }
  return round2(bal);
}

// ---------------------------------------------------------------------------
// Category breakdown (Excel R10 — SUMIF outflow by category)
// ---------------------------------------------------------------------------
export interface CategoryTotal {
  id: string | null;
  name: string;
  hue: number | null;
  total: number;
  count: number;
}

export function categoryTotals(
  txns: TransactionRow[],
  categories: CategoryRow[],
): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const agg = new Map<string | null, { total: number; count: number }>();
  for (const t of txns) {
    if (t.direction !== "outflow" || t.is_transfer) continue;
    const key = t.category_id;
    const cur = agg.get(key) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    agg.set(key, cur);
  }
  return [...agg.entries()]
    .map(([id, { total, count }]) => {
      const cat = id ? byId.get(id) : undefined;
      return {
        id,
        name: cat?.name ?? "Uncategorized",
        hue: cat?.color_hue ?? null,
        total: round2(total),
        count,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// Per-account activity & balances
// ---------------------------------------------------------------------------
export interface AccountActivity {
  account: AccountRow;
  inflow: number;
  outflow: number;
  net: number; // inflow − outflow
  balance: number; // opening_balance + net
}

export function accountActivity(
  txns: TransactionRow[],
  accounts: AccountRow[],
): AccountActivity[] {
  const agg = new Map<string, { inflow: number; outflow: number; delta: number }>();
  for (const t of txns) {
    const cur = agg.get(t.account_id) ?? { inflow: 0, outflow: 0, delta: 0 };
    cur.delta += signed(t); // every movement (incl. transfers) affects the balance
    if (!t.is_transfer) {
      // in/out activity excludes transfers (they aren't income/spending)
      if (t.direction === "inflow") cur.inflow += t.amount;
      else cur.outflow += t.amount;
    }
    agg.set(t.account_id, cur);
  }
  return accounts
    .map((account) => {
      const { inflow = 0, outflow = 0, delta = 0 } = agg.get(account.id) ?? {};
      return {
        account,
        inflow: round2(inflow),
        outflow: round2(outflow),
        net: round2(inflow - outflow),
        balance: round2(account.opening_balance + delta),
      };
    })
    .sort((a, b) => a.account.display_order - b.account.display_order);
}

// ---------------------------------------------------------------------------
// Inflow type & "whose expense" breakdowns
// ---------------------------------------------------------------------------
export function inflowTypeTotals(
  txns: TransactionRow[],
  inflowTypes: InflowTypeRow[],
): { id: string | null; name: string; total: number; count: number }[] {
  const byId = new Map(inflowTypes.map((i) => [i.id, i]));
  const agg = new Map<string | null, { total: number; count: number }>();
  for (const t of txns) {
    if (t.direction !== "inflow" || t.is_transfer) continue;
    const cur = agg.get(t.inflow_type_id) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    agg.set(t.inflow_type_id, cur);
  }
  return [...agg.entries()]
    .map(([id, v]) => ({
      id,
      name: (id ? byId.get(id)?.name : undefined) ?? "Other",
      total: round2(v.total),
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Count paychecks (inflow rows whose type is flagged is_paycheck). */
export function paycheckCount(txns: TransactionRow[], inflowTypes: InflowTypeRow[]): number {
  const paycheckIds = new Set(inflowTypes.filter((i) => i.is_paycheck).map((i) => i.id));
  return txns.filter((t) => t.direction === "inflow" && t.inflow_type_id && paycheckIds.has(t.inflow_type_id)).length;
}

// ---------------------------------------------------------------------------
// Debtors — explicit, user-managed amounts owed to you (not auto-derived).
// ---------------------------------------------------------------------------
/** Total currently owed to you across all debtors. */
export function sumOwed(debtors: Pick<DebtorRow, "amount">[]): number {
  return round2(debtors.reduce((s, d) => s + (d.amount ?? 0), 0));
}

// ---------------------------------------------------------------------------
// India transfers (Excel R8 — effective FX = INR / USD)
// ---------------------------------------------------------------------------
export interface FxSummary {
  totalReceivedUsd: number;
  totalSentUsd: number;
  totalReceivedInr: number;
  totalSentInr: number;
  avgReceivedRate: number | null; // weighted INR/USD
  avgSentRate: number | null;
}

export function fxSummary(transfers: IndiaTransferRow[]): FxSummary {
  let rUsd = 0, sUsd = 0, rInr = 0, sInr = 0;
  for (const t of transfers) {
    if (t.direction === "received") {
      rUsd += t.usd_amount;
      rInr += t.inr_amount;
    } else {
      sUsd += t.usd_amount;
      sInr += t.inr_amount;
    }
  }
  return {
    totalReceivedUsd: round2(rUsd),
    totalSentUsd: round2(sUsd),
    totalReceivedInr: round2(rInr),
    totalSentInr: round2(sInr),
    avgReceivedRate: rUsd > 0 ? round2(rInr / rUsd) : null,
    avgSentRate: sUsd > 0 ? round2(sInr / sUsd) : null,
  };
}
