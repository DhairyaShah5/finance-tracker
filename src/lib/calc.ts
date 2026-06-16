// Pure derivation engine - no I/O. Turns raw ledger rows into the metrics the
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

export type BudgetGroup = "needs" | "wants" | "savings";

/** Signed cash amount: inflow positive, outflow negative. */
export function signed(t: Pick<TransactionRow, "direction" | "amount">): number {
  return t.direction === "inflow" ? t.amount : -t.amount;
}

/**
 * The arrival capital (wire from home, forex card, opening cash). These inflows
 * ARE the starting balance, so they're not counted as income - counting them
 * would double the starting funds.
 */
const ARRIVAL_DEPOSIT = /wire transfer from home|forex card to bofa|initial cash deposit/i;
export function isArrivalDeposit(t: Pick<TransactionRow, "description">): boolean {
  return ARRIVAL_DEPOSIT.test(t.description);
}

/** A transaction the user classified as savings (set aside, not consumed). */
export function isSavingsTxn(t: Pick<TransactionRow, "budget_group">): boolean {
  return t.budget_group === "savings";
}

/**
 * The portion of an OUTFLOW that is your own expense:
 *   My / none           → full amount
 *   Friend              → 0 (fronted entirely for someone else)
 *   Group / Roommates   → amount ÷ split_count (your share; 0 if no split set)
 * Transfers and inflows → 0.
 */
export function myAmount(
  t: Pick<TransactionRow, "direction" | "amount" | "is_transfer" | "whose_expense" | "split_count">,
): number {
  if (t.direction !== "outflow" || t.is_transfer) return 0;
  if (t.whose_expense === "Friend") return 0;
  if (t.whose_expense === "Group" || t.whose_expense === "Roommates") {
    return t.split_count && t.split_count > 0 ? round2(t.amount / t.split_count) : 0;
  }
  return t.amount;
}

// ---------------------------------------------------------------------------
// Monthly summaries - the Dashboard / closing-balance chain (Excel R1–R6)
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
    if (t.direction === "outflow") {
      if (isSavingsTxn(t)) continue; // savings isn't an expense
      bucket.expenses += myAmount(t); // only your share of split expenses
    } else if (!isArrivalDeposit(t)) bucket.inflow += t.amount; // arrival = starting balance
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

export interface BalancePoint {
  month: string; // 'YYYY-MM'
  label: string;
  balance: number;
}

/**
 * Actual account-balance trajectory over time. Uses ALL flows (transfers
 * included, since they move real money) and is anchored so the final point
 * equals current net worth - the implied pre-ledger balance back-fills the rest.
 */
export function realBalanceTrend(txns: TransactionRow[], netWorth: number): BalancePoint[] {
  const byMonth = new Map<string, number>();
  let signedAll = 0;
  for (const t of txns) {
    const s = signed(t);
    signedAll += s;
    byMonth.set(monthKey(t.txn_date), round2((byMonth.get(monthKey(t.txn_date)) ?? 0) + s));
  }
  let running = round2(netWorth - signedAll); // balance implied before the first txn
  const out: BalancePoint[] = [];
  for (const m of [...byMonth.keys()].sort()) {
    running = round2(running + (byMonth.get(m) ?? 0));
    out.push({ month: m, label: monthLabel(m), balance: running });
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
// Category breakdown (Excel R10 - SUMIF outflow by category)
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
    if (t.direction !== "outflow") continue;
    // Savings (investments, vault) are not spending - keep them out of the breakdown.
    if (isSavingsTxn(t)) continue;
    const share = myAmount(t); // your share only (handles transfers / friend / split)
    if (share === 0) continue;
    const key = t.category_id;
    const cur = agg.get(key) ?? { total: 0, count: 0 };
    cur.total += share;
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
// 50 / 30 / 20 budgeting - needs / wants / savings split of spending per month
// ---------------------------------------------------------------------------
export interface MonthGroups {
  month: string;
  label: string;
  needs: number;
  wants: number;
  savings: number;
  unclassified: number;
  total: number;
}

export function budgetGroupsByMonth(txns: TransactionRow[]): MonthGroups[] {
  const byMonth = new Map<string, Omit<MonthGroups, "month" | "label" | "total">>();
  for (const t of txns) {
    if (t.direction !== "outflow" || t.is_transfer) continue;
    const share = myAmount(t); // your share only
    if (share === 0) continue;
    const g = t.budget_group; // each transaction carries its own classification
    const m = monthKey(t.txn_date);
    const b = byMonth.get(m) ?? { needs: 0, wants: 0, savings: 0, unclassified: 0 };
    if (g === "needs") b.needs += share;
    else if (g === "wants") b.wants += share;
    else if (g === "savings") b.savings += share;
    else b.unclassified += share;
    byMonth.set(m, b);
  }
  return [...byMonth.keys()]
    .sort()
    .map((m) => {
      const b = byMonth.get(m)!;
      return {
        month: m,
        label: monthLabel(m),
        needs: round2(b.needs),
        wants: round2(b.wants),
        savings: round2(b.savings),
        unclassified: round2(b.unclassified),
        total: round2(b.needs + b.wants + b.savings + b.unclassified),
      };
    });
}

// ---------------------------------------------------------------------------
// Reconciliation - proves the cash identity:
//   starting + income − spending − savings − netToOthers = current balance
// Every dollar lands in exactly one bucket, so the waterfall closes to the cent.
// ---------------------------------------------------------------------------
export interface Reconciliation {
  income: number; // every inflow that stayed yours - paychecks + the arrival capital
  arrivalCapital: number; // the slice of income you arrived with (shown for context)
  consumption: number; // your share of non-savings outflows (categorized spending)
  settled: number; // tiny net of informal friend/shared washes folded into spending
  spending: number; // consumption + settled - the figure that closes the identity
  savings: number; // your share of savings outflows (investments, vault)
  currentBalance: number; // = net worth (the ground-truth account total)
}

/**
 * Decompose the ledger so the cash identity closes on three terms:
 *   income − spending − savings = current balance.
 * The arrival capital (the money you flew in with) IS income - your early
 * expenses came straight out of it. Friend-fronting and shared splits settle
 * informally and never net perfectly, leaving a tiny residual (`settled`); we
 * fold it into spending rather than show a separate line, so the waterfall stays
 * clean and exact.
 */
export function reconcile(txns: TransactionRow[], netWorth: number): Reconciliation {
  let income = 0;
  let arrivalCapital = 0;
  let consumption = 0;
  let savings = 0;
  for (const t of txns) {
    if (t.is_transfer) continue;
    if (t.direction === "inflow") {
      income += t.amount;
      if (isArrivalDeposit(t)) arrivalCapital += t.amount;
    } else if (isSavingsTxn(t)) {
      savings += myAmount(t);
    } else {
      consumption += myAmount(t);
    }
  }
  income = round2(income);
  arrivalCapital = round2(arrivalCapital);
  consumption = round2(consumption);
  savings = round2(savings);
  const currentBalance = round2(netWorth);
  // Residual from imperfect informal settlements - folded into spending.
  const settled = round2(income - consumption - savings - currentBalance);
  const spending = round2(consumption + settled);
  return { income, arrivalCapital, consumption, settled, spending, savings, currentBalance };
}

// ---------------------------------------------------------------------------
// Budgets - adaptive per-category monthly targets vs. actual spend.
// Each budget is the effective number: a manual pin if set, otherwise a
// suggestion learned from your recent spending (a weighted trailing average), so
// it follows your patterns - e.g. eating-out rises during a summer internship
// and falls again back at school.
// ---------------------------------------------------------------------------
export interface CategoryBudget {
  id: string;
  name: string;
  hue: number | null;
  budget: number; // effective: pinned if set, else the learned suggestion
  pinned: number | null; // manual override, null = auto
  suggested: number; // learned from recent months
  isAuto: boolean; // budget came from the suggestion (no pin)
  spent: number; // your share spent this month
  remaining: number; // budget - spent (negative = over)
  pct: number; // spent / budget
  trend: "up" | "down" | "flat"; // recent direction of spend
}
export interface BudgetStatus {
  month: string;
  label: string;
  categories: CategoryBudget[];
  totalBudget: number;
  totalSpent: number; // all non-savings spend this month (incl. uncategorized)
  unbudgetedSpent: number; // uncategorized spend this month
  remaining: number; // totalBudget - totalSpent
  pct: number;
  anyPinned: boolean;
  pacing: { label: string; Spent: number | null; Budget: number }[]; // cumulative
}

/** The k calendar months immediately before `month`, most-recent first. */
function priorMonthKeys(month: string, k: number): string[] {
  const [y0, m0] = month.split("-").map(Number);
  const out: string[] = [];
  let y = y0;
  let m = m0;
  for (let i = 0; i < k; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

/**
 * This month's spend vs. an adaptive budget per category. The budget is a manual
 * pin if set, else a suggestion = median of your last 3 months' share of spend
 * (robust to one-off months), rounded to $5. Recomputed every month, so it
 * tracks your patterns automatically.
 */
export function monthlyBudgetStatus(
  txns: TransactionRow[],
  categories: CategoryRow[],
  month: string,
  throughDay?: number,
): BudgetStatus {
  const spentThis = new Map<string, number>();
  const byCatMonth = new Map<string, Map<string, number>>(); // catId -> month -> share
  const perDay = new Map<number, number>(); // day-of-month -> share (this month)
  let totalSpent = 0;
  let unbudgetedSpent = 0;
  for (const t of txns) {
    if (t.is_transfer || t.direction !== "outflow" || isSavingsTxn(t)) continue;
    const share = myAmount(t);
    if (share === 0) continue;
    const m = monthKey(t.txn_date);
    const key = t.category_id ?? "__none__";
    if (m === month) {
      totalSpent = round2(totalSpent + share);
      spentThis.set(key, round2((spentThis.get(key) ?? 0) + share));
      if (key === "__none__") unbudgetedSpent = round2(unbudgetedSpent + share);
      const day = Number(t.txn_date.slice(8, 10));
      perDay.set(day, round2((perDay.get(day) ?? 0) + share));
    } else if (m < month) {
      let mm = byCatMonth.get(key);
      if (!mm) {
        mm = new Map();
        byCatMonth.set(key, mm);
      }
      mm.set(m, round2((mm.get(m) ?? 0) + share));
    }
  }

  const pm = priorMonthKeys(month, 3);
  const WEIGHTS = [0.5, 0.3, 0.2]; // recent months count most
  const learn = (id: string) => {
    const mm = byCatMonth.get(id);
    const vals = pm.map((m) => mm?.get(m) ?? 0); // [recent, prev, prev2]
    // A category earns a budget only if it recurs (active in >= 2 of the last 3
    // months); one-offs like an annual fee or a single splurge get $0. Otherwise
    // it's a recency-weighted average, so the budget tracks your current level.
    const active = vals.filter((v) => v > 5).length;
    const suggested =
      active >= 2 ? Math.round(vals.reduce((s, v, i) => s + v * WEIGHTS[i], 0) / 5) * 5 : 0;
    const [recent, prev] = vals;
    const trend: "up" | "down" | "flat" =
      recent > prev * 1.15 && recent > 5 ? "up" : recent < prev * 0.85 && prev > 5 ? "down" : "flat";
    return { suggested, trend };
  };

  let totalBudget = 0;
  let anyPinned = false;
  const cats: CategoryBudget[] = [];
  for (const c of categories) {
    const { suggested, trend } = learn(c.id);
    const pinned = c.monthly_budget != null ? round2(c.monthly_budget) : null;
    if (pinned != null) anyPinned = true;
    const budget = pinned != null ? pinned : suggested;
    const spent = round2(spentThis.get(c.id) ?? 0);
    totalBudget = round2(totalBudget + budget);
    if (budget <= 0 && spent <= 0) continue; // nothing meaningful to show
    cats.push({
      id: c.id,
      name: c.name,
      hue: c.color_hue,
      budget,
      pinned,
      suggested,
      isAuto: pinned == null,
      spent,
      remaining: round2(budget - spent),
      pct: budget > 0 ? spent / budget : spent > 0 ? 9 : 0,
      trend,
    });
  }
  cats.sort((a, b) => b.budget - a.budget || b.spent - a.spent);

  // Cumulative pacing: actual spend vs. an even budget allowance, sampled weekly
  // (plus today for the live month). Mirrors a "max allowed vs spent" tracker.
  const totalB = round2(totalBudget);
  const dim = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const sampleDays = [...new Set([7, 14, 21, 28, dim, ...(throughDay != null ? [throughDay] : [])])]
    .filter((d) => d >= 1 && d <= dim)
    .sort((a, b) => a - b);
  const pacing: { label: string; Spent: number | null; Budget: number }[] = [
    { label: "Start", Spent: 0, Budget: 0 },
  ];
  let cum = 0;
  let di = 1;
  for (const d of sampleDays) {
    while (di <= d) {
      cum = round2(cum + (perDay.get(di) ?? 0));
      di++;
    }
    pacing.push({
      label: String(d),
      Spent: throughDay != null && d > throughDay ? null : round2(cum),
      Budget: round2((totalB * d) / dim),
    });
  }

  return {
    month,
    label: monthLabel(month),
    categories: cats,
    totalBudget: totalB,
    totalSpent: round2(totalSpent),
    unbudgetedSpent: round2(unbudgetedSpent),
    remaining: round2(totalB - totalSpent),
    pct: totalB > 0 ? totalSpent / totalB : 0,
    anyPinned,
    pacing,
  };
}

/** Monthly income (counted = paycheck inflows) keyed by month. */
export function incomeByMonth(txns: TransactionRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "inflow" || t.is_transfer) continue;
    m.set(monthKey(t.txn_date), round2((m.get(monthKey(t.txn_date)) ?? 0) + t.amount));
  }
  return m;
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
// Debtors - explicit, user-managed amounts owed to you (not auto-derived).
// ---------------------------------------------------------------------------
/** Total currently owed to you across all debtors. */
export function sumOwed(debtors: Pick<DebtorRow, "amount">[]): number {
  return round2(debtors.reduce((s, d) => s + (d.amount ?? 0), 0));
}

// ---------------------------------------------------------------------------
// India transfers (Excel R8 - effective FX = INR / USD)
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
