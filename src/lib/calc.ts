// Pure derivation engine - no I/O. Turns raw ledger rows into the metrics the
// UI renders. Mirrors the formulas in the source Excel workbook (see
// _research/08-excel-domain-model.md §4) but normalized and consistent.

import type {
  AccountRow,
  CategoryRow,
  CreditorRow,
  DebtorRow,
  IndiaTransferRow,
  SettingsRow,
  TransactionDebtorRow,
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
 * Narrow accounts + transactions to what the app should DISPLAY, dropping every
 * account the user has hidden along with every transaction on it. A hidden
 * account then vanishes from all derived numbers - net worth, spending, income,
 * budget, category and cash-flow charts - because neither its balance nor its
 * activity reaches any calculation, while the rows themselves stay in the ledger.
 * Feed the returned `accounts` + `txns` into the calc functions on every page
 * except the raw Transactions list (which can opt back in to show hidden rows).
 */
export function visibleLedger<A extends { id: string; hidden?: boolean | null }>(
  accounts: A[],
  txns: TransactionRow[],
  categories?: Pick<CategoryRow, "id" | "linked_account_id">[],
): { accounts: A[]; txns: TransactionRow[]; hiddenIds: Set<string> } {
  const hiddenIds = new Set(accounts.filter((a) => a.hidden).map((a) => a.id));
  if (!hiddenIds.size) return { accounts, txns, hiddenIds };

  // A category-linked outflow routed INTO a hidden account (e.g. a savings deposit
  // to a hidden vault) is money leaving your visible accounts for one you no
  // longer track. Treat it like a transfer out: it still lowers the source
  // balance and net worth, but stops counting as savings/spending - otherwise a
  // hidden savings account's balance would leave net worth while the deposits that
  // built it kept inflating "total saved".
  const hiddenLinkedCats = new Set(
    (categories ?? []).filter((c) => c.linked_account_id && hiddenIds.has(c.linked_account_id)).map((c) => c.id),
  );
  const visible: TransactionRow[] = [];
  for (const t of txns) {
    if (hiddenIds.has(t.account_id)) continue; // rows physically on a hidden account
    if (!t.is_transfer && t.direction === "outflow" && t.category_id && hiddenLinkedCats.has(t.category_id)) {
      visible.push({ ...t, is_transfer: true }); // reclassify: routed into a hidden account
    } else {
      visible.push(t);
    }
  }
  return { accounts: accounts.filter((a) => !a.hidden), txns: visible, hiddenIds };
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
 * A refund / return: money spent that is coming back to you. Modeled as a
 * categorized INFLOW - it nets against that category's spending (so the category
 * reflects your NET cost) and is NOT counted as income. Regular income inflows
 * carry an inflow_type and no category; a refund carries a category. Transfers
 * (fronted money returning, internal moves) are never refunds.
 */
export function isRefund(
  t: Pick<TransactionRow, "direction" | "is_transfer" | "category_id">,
): boolean {
  return t.direction === "inflow" && !t.is_transfer && t.category_id != null;
}

/**
 * The portion of an OUTFLOW that is your own expense:
 *   My / none           → full amount
 *   Friend              → 0 (fronted entirely for someone else)
 *   Reimbursable        → 0 (a work/other expense you will be paid back for)
 *   Group / Roommates   → amount ÷ split_count (your share; 0 if no split set)
 * An explicit `my_share` overrides all of the above (e.g. a partly reimbursable
 * bill where you keep a slice). Transfers and inflows → 0.
 */
export function myAmount(
  t: Pick<TransactionRow, "direction" | "amount" | "is_transfer" | "whose_expense" | "split_count" | "my_share" | "reimbursable">,
): number {
  if (t.direction !== "outflow" || t.is_transfer) return 0;
  // Explicit override (you covered more/less than the even split, or kept a slice
  // of a reimbursable bill) always wins.
  if (t.my_share != null) return round2(Math.min(t.my_share, t.amount));
  if (t.reimbursable) return 0; // you will be paid back - not your spending
  if (t.whose_expense === "Friend") return 0;
  if (t.whose_expense === "Group" || t.whose_expense === "Roommates") {
    return t.split_count && t.split_count > 0 ? round2(t.amount / t.split_count) : 0;
  }
  return t.amount;
}

/**
 * Money you fronted on reimbursable expenses that hasn't been paid back yet - a
 * receivable, not spending. The reimbursable portion of each expense is the part
 * that isn't your own share (usually the whole amount, or `amount − my_share`
 * when you kept a slice), minus whatever has already been paid back
 * (`reimbursed_amount`, which supports partial / installment reimbursements).
 */
export function pendingReimbursements(
  txns: Pick<
    TransactionRow,
    "direction" | "amount" | "is_transfer" | "whose_expense" | "split_count" | "my_share" | "reimbursable" | "reimbursed_amount"
  >[],
): number {
  let total = 0;
  for (const t of txns) {
    if (t.direction !== "outflow" || t.is_transfer) continue;
    if (!t.reimbursable) continue;
    const owed = round2(t.amount - myAmount(t)); // the part meant to come back to you
    const back = round2(owed - (t.reimbursed_amount ?? 0)); // still outstanding
    if (back > 0) total = round2(total + back);
  }
  return round2(total);
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

export interface MonthBalance {
  opening: number;
  closing: number;
}

/**
 * Opening and closing available-funds (net worth) balance for each month with
 * activity, anchored so the latest month's closing equals current net worth.
 * Only flows on net-worth accounts move the balance - depositing into an excluded
 * savings/investment stash correctly lowers it (the money left a spendable
 * account), and a month's opening is just the prior month's closing.
 */
export function monthlyBalances(
  txns: Pick<TransactionRow, "txn_date" | "account_id" | "direction" | "amount">[],
  netWorthAccountIds: Set<string>,
  netWorth: number,
): Map<string, MonthBalance> {
  const change = new Map<string, number>();
  for (const t of txns) {
    if (!netWorthAccountIds.has(t.account_id)) continue;
    const k = monthKey(t.txn_date);
    change.set(k, round2((change.get(k) ?? 0) + signed(t)));
  }
  const total = round2([...change.values()].reduce((s, c) => s + c, 0));
  let running = round2(netWorth - total); // net worth before the first tracked month
  const out = new Map<string, MonthBalance>();
  for (const k of [...change.keys()].sort()) {
    const opening = running;
    const closing = round2(opening + (change.get(k) ?? 0));
    out.set(k, { opening, closing });
    running = closing;
  }
  return out;
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
    // Refunds (categorized inflows) are returned spend - subtract from the
    // category so it shows your NET cost, matching the reconciliation.
    if (isRefund(t)) {
      const cur = agg.get(t.category_id) ?? { total: 0, count: 0 };
      cur.total -= t.amount;
      agg.set(t.category_id, cur);
      continue;
    }
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
  income: number; // earned income that stayed yours - paychecks etc. (arrival excluded)
  arrivalCapital: number; // the starting funds you arrived with (not income)
  consumption: number; // your NET share of non-savings outflows (== spending == donut)
  settled: number; // unreconciled gap: logged activity vs. actual balances (own line)
  reimbursable: number; // fronted on reimbursable expenses, owed back to you (receivable)
  spending: number; // your net spending - equals the category totals exactly
  savings: number; // your share of savings outflows (investments, vault)
  currentBalance: number; // = net worth (the ground-truth account total)
}

/**
 * Decompose the ledger so the cash identity closes:
 *   arrival + income − spending − savings − reimbursable − settled = current balance.
 * `spending` is your NET consumption - the sum of every category's spend, refunds
 * already netted out - so the "Total spent" KPI equals the category donut to the
 * cent. The arrival capital (the money you flew in with) is your STARTING funds,
 * NOT income - it's carried in its own `arrivalCapital` bucket on the money-in
 * side of the identity, so `income` reflects only what you earned (paychecks and
 * the like). Refunds / returns (categorized inflows) reduce the category they came
 * from, not income. Money fronted on reimbursable expenses is carried as a
 * receivable (`reimbursable`), not spending. Whatever is left over - the gap
 * between your logged activity and your actual account balances (usually a balance
 * that needs correcting) - is `settled`, shown as its own honest line rather than
 * hidden inside spending.
 */
export function reconcile(txns: TransactionRow[], netWorth: number): Reconciliation {
  let income = 0; // earned income only - paychecks etc. (arrival excluded)
  let arrivalCapital = 0; // the starting funds you arrived with - NOT income
  let consumption = 0;
  let savings = 0;
  for (const t of txns) {
    if (t.is_transfer) continue;
    if (isRefund(t)) {
      consumption -= t.amount; // returned spend - nets against your consumption, not income
    } else if (t.direction === "inflow") {
      // Arrival capital is starting funds, not income - keep it in its own bucket.
      if (isArrivalDeposit(t)) arrivalCapital += t.amount;
      else income += t.amount;
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
  // Fronted reimbursable money is out of your accounts but coming back - carry it
  // as a receivable, not spending.
  const reimbursable = pendingReimbursements(txns);
  // The leftover informal-settlement residual gets its own line - NOT folded into
  // spending, so "Total spent" stays equal to the category donut. Arrival capital
  // is real money in your accounts (part of net worth), so it sits on the money-in
  // side of the identity even though it isn't income.
  const settled = round2(income + arrivalCapital - consumption - savings - currentBalance - reimbursable);
  const spending = consumption;
  return { income, arrivalCapital, consumption, settled, reimbursable, spending, savings, currentBalance };
}

// ---------------------------------------------------------------------------
// Budgets - spending-anchored. The monthly budget is what you TYPICALLY spend
// plus a modest headroom:
//   budget total = expected spend * SPEND_HEADROOM  (floored at a runway
//   allowance for months with little history). It's split across categories by
//   your recent spending mix, so each category's budget is about what you
//   usually spend there. This keeps the budget realistic and stable instead of
//   ballooning in a high-income month. "expected" = what you typically spend.
// ---------------------------------------------------------------------------
export interface CategoryBudget {
  id: string;
  name: string;
  hue: number | null;
  budget: number; // effective: pinned if set, else the affordable allocation
  pinned: number | null; // manual override, null = auto
  expected: number; // what you typically spend here (learned)
  isAuto: boolean; // budget came from the allocation (no pin)
  spent: number; // your share spent this month
  remaining: number; // budget - spent (negative = over)
  pct: number; // spent / budget
  trend: "up" | "down" | "flat"; // recent direction of spend
}
export interface BudgetStatus {
  month: string;
  label: string;
  categories: CategoryBudget[];
  totalBudget: number; // sum of effective per-category budgets (~ affordable)
  affordable: number; // typical spend * headroom (runway floor) - the budget pool
  expected: number; // total you typically spend
  income: number; // recent income, shown for reference only (no longer anchors)
  totalSpent: number; // all non-savings spend this month (incl. uncategorized)
  unbudgetedSpent: number; // uncategorized spend this month
  remaining: number; // totalBudget - totalSpent
  pct: number;
  anyPinned: boolean;
}

/**
 * This month's spend vs. a spending-anchored budget. The budget pool is
 * `expected spend * SPEND_HEADROOM`, floored at `runwayFloor` so months with
 * little history still get a sensible allowance. It's allocated across categories
 * by your recent spending mix; a manual pin overrides a category's allocation.
 */
export function monthlyBudgetStatus(
  txns: TransactionRow[],
  categories: CategoryRow[],
  month: string,
  throughDay?: number,
  runwayFloor = 0,
): BudgetStatus {
  const spentThis = new Map<string, number>();
  const byCatMonth = new Map<string, Map<string, number>>(); // catId -> month -> share
  const incomeByM = new Map<string, number>(); // month -> counted income (excl. target)
  const allMonths = new Set<string>(); // every month with spend data (excl. target)
  let totalSpent = 0;
  let unbudgetedSpent = 0;
  for (const t of txns) {
    if (t.is_transfer) continue;
    const m = monthKey(t.txn_date);
    if (t.direction === "inflow") {
      // Refunds (categorized inflows) are returned spend: net them against the
      // category so budgets reflect NET cost, exactly like categoryTotals and
      // reconcile. They are not income.
      if (isRefund(t)) {
        const key = t.category_id!; // isRefund guarantees a category
        if (m === month) {
          totalSpent = round2(totalSpent - t.amount);
          spentThis.set(key, round2((spentThis.get(key) ?? 0) - t.amount));
        } else {
          allMonths.add(m);
          let mm = byCatMonth.get(key);
          if (!mm) {
            mm = new Map();
            byCatMonth.set(key, mm);
          }
          mm.set(m, round2((mm.get(m) ?? 0) - t.amount));
        }
        continue;
      }
      if (m !== month && !isArrivalDeposit(t)) {
        incomeByM.set(m, round2((incomeByM.get(m) ?? 0) + t.amount));
      }
      continue;
    }
    if (isSavingsTxn(t)) continue;
    const share = myAmount(t);
    if (share === 0) continue;
    const key = t.category_id ?? "__none__";
    if (m === month) {
      totalSpent = round2(totalSpent + share);
      spentThis.set(key, round2((spentThis.get(key) ?? 0) + share));
      if (key === "__none__") unbudgetedSpent = round2(unbudgetedSpent + share);
    } else {
      allMonths.add(m);
      let mm = byCatMonth.get(key);
      if (!mm) {
        mm = new Map();
        byCatMonth.set(key, mm);
      }
      mm.set(m, round2((mm.get(m) ?? 0) + share));
    }
  }

  // Window = 3 nearest months with data (prior preferred; forward-fill for early
  // months). Closer months weigh more.
  const monthIndex = (k: string) => {
    const [y, mo] = k.split("-").map(Number);
    return y * 12 + mo;
  };
  const tIdx = monthIndex(month);
  const windowMonths = [...allMonths]
    .map((k) => ({ key: k, dist: Math.abs(monthIndex(k) - tIdx), prior: monthIndex(k) < tIdx }))
    .sort((a, b) => a.dist - b.dist || Number(b.prior) - Number(a.prior))
    .slice(0, 3);
  const wsum = windowMonths.reduce((s, w) => s + 1 / w.dist, 0) || 1;

  // Expected spend per category = recency-weighted average over the window.
  // Recurring only (active in >= 2 of the window) so one-offs don't count.
  const learn = (id: string) => {
    const mm = byCatMonth.get(id);
    const vals = windowMonths.map((w) => mm?.get(w.key) ?? 0);
    const active = vals.filter((v) => v > 5).length;
    if (active < 2) return { expected: 0, trend: "flat" as const };
    const wavg = windowMonths.reduce((s, w, i) => s + vals[i] / w.dist, 0) / wsum;
    const expected = Math.round(wavg / 5) * 5;
    const [recent, prev] = vals;
    const trend: "up" | "down" | "flat" =
      recent > prev * 1.15 && recent > 5 ? "up" : recent < prev * 0.85 && prev > 5 ? "down" : "flat";
    return { expected, trend };
  };

  // "no budget" categories (one-off catch-alls) are excluded from learning and
  // allocation entirely, so they never contribute to the split.
  const learned = categories.map((c) => ({
    c,
    ...(c.no_budget ? { expected: 0, trend: "flat" as const } : learn(c.id)),
  }));
  const expectedTotal = round2(learned.reduce((s, x) => s + x.expected, 0));

  // Spending-anchored budget: what you typically spend, plus a modest headroom -
  // so it stays realistic and stable even when income swings (a big
  // internship-paycheck month shouldn't triple your budget). Floored at the
  // runway allowance for months with little spending history. recentIncome is
  // kept for reference in the UI only; it no longer drives the budget.
  const SPEND_HEADROOM = 1.15;
  const recentIncome = round2(
    windowMonths.reduce((s, w) => s + (incomeByM.get(w.key) ?? 0) / w.dist, 0) / wsum,
  );
  const affordable = round2(Math.max(expectedTotal * SPEND_HEADROOM, runwayFloor));

  let totalBudget = 0;
  let anyPinned = false;
  const cats: CategoryBudget[] = [];
  for (const { c, expected, trend } of learned) {
    // no_budget forces a 0 budget with no pin (shows as "one-off / no budget").
    const pinned = !c.no_budget && c.monthly_budget != null ? round2(c.monthly_budget) : null;
    if (pinned != null) anyPinned = true;
    // Split the affordable total across categories by their share of expected spend.
    const allocation =
      expectedTotal > 0 ? Math.round((affordable * (expected / expectedTotal)) / 5) * 5 : 0;
    const budget = pinned != null ? pinned : allocation;
    const spent = round2(spentThis.get(c.id) ?? 0);
    totalBudget = round2(totalBudget + budget);
    if (budget <= 0 && spent <= 0 && expected <= 0) continue; // nothing to show
    cats.push({
      id: c.id,
      name: c.name,
      hue: c.color_hue,
      budget,
      pinned,
      expected,
      isAuto: pinned == null,
      spent,
      remaining: round2(budget - spent),
      pct: budget > 0 ? spent / budget : spent > 0 ? 9 : 0,
      trend,
    });
  }
  cats.sort((a, b) => b.budget - a.budget || b.spent - a.spent);

  const totalB = round2(totalBudget);
  return {
    month,
    label: monthLabel(month),
    categories: cats,
    totalBudget: totalB,
    affordable,
    expected: expectedTotal,
    income: recentIncome,
    totalSpent: round2(totalSpent),
    unbudgetedSpent: round2(unbudgetedSpent),
    remaining: round2(totalB - totalSpent),
    pct: totalB > 0 ? totalSpent / totalB : 0,
    anyPinned,
  };
}

/**
 * Monthly earned income keyed by month - paychecks and the like. Arrival capital
 * is starting funds, not income, so it's excluded (matching reconcile()). Refunds
 * (categorized inflows) are returned spend, NOT income, so they're excluded too -
 * keeping the Insights total equal to the Dashboard's income figure.
 */
export function incomeByMonth(txns: TransactionRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "inflow" || t.is_transfer || isRefund(t) || isArrivalDeposit(t)) continue;
    m.set(monthKey(t.txn_date), round2((m.get(monthKey(t.txn_date)) ?? 0) + t.amount));
  }
  return m;
}

// ---------------------------------------------------------------------------
// Monthly cash flow - surplus / deficit per month. Same decomposition as
// reconcile(), sliced by month:
//   earned income − living expenses − investments = net cash flow
// Arrival capital is EXCLUDED - it's one-time starting funds, not monthly
// income, and counting it would make the arrival month a huge outlier. Refunds
// net against living expenses (never income) and transfers are ignored, exactly
// as everywhere else.
// ---------------------------------------------------------------------------
export interface MonthlyCashFlow {
  month: string; // 'YYYY-MM'
  label: string;
  income: number; // earned income that stayed yours (paychecks; arrival excluded)
  expenses: number; // living expenses = your net share of consumption
  investments: number; // money set aside (savings / investments)
  net: number; // income − expenses − investments  (surplus > 0, deficit < 0)
}

export function monthlyCashFlow(txns: TransactionRow[]): MonthlyCashFlow[] {
  const by = new Map<string, { income: number; expenses: number; investments: number }>();
  for (const t of txns) {
    if (t.is_transfer) continue;
    const k = monthKey(t.txn_date);
    const b = by.get(k) ?? { income: 0, expenses: 0, investments: 0 };
    if (isRefund(t)) {
      b.expenses -= t.amount; // a return reduces your net living cost, not income
    } else if (t.direction === "inflow") {
      if (!isArrivalDeposit(t)) b.income += t.amount; // arrival = starting funds, skip
    } else if (isSavingsTxn(t)) {
      b.investments += myAmount(t);
    } else {
      b.expenses += myAmount(t);
    }
    by.set(k, b);
  }
  return [...by.keys()].sort().map((k) => {
    const b = by.get(k)!;
    const income = round2(b.income);
    const expenses = round2(b.expenses);
    const investments = round2(b.investments);
    return { month: k, label: monthLabel(k), income, expenses, investments, net: round2(income - expenses - investments) };
  });
}

// ---------------------------------------------------------------------------
// Per-account activity & balances
// ---------------------------------------------------------------------------
export interface AccountActivity {
  account: AccountRow;
  inflow: number; // every credit on the account (transfers + linked deposits included)
  outflow: number; // every debit on the account (transfers included)
  net: number; // inflow − outflow
  balance: number; // opening_balance + net
}

export function accountActivity(
  txns: TransactionRow[],
  accounts: AccountRow[],
  categories?: Pick<CategoryRow, "id" | "linked_account_id">[],
): AccountActivity[] {
  const agg = new Map<string, { inflow: number; outflow: number; delta: number }>();
  for (const t of txns) {
    const cur = agg.get(t.account_id) ?? { inflow: 0, outflow: 0, delta: 0 };
    // A per-account view is a bank statement: every credit and debit on the
    // account counts - transfers included - so opening_balance + inflow − outflow
    // = balance for each account. (Income vs. spending, which excludes transfers,
    // lives in reconcile()/monthlyCashFlow(), not here.)
    cur.delta += signed(t);
    if (t.direction === "inflow") cur.inflow += t.amount;
    else cur.outflow += t.amount;
    agg.set(t.account_id, cur);
  }

  // Category-linked deposits: an outflow in a category that points to a
  // destination account (e.g. "Investment" -> RobinHood) is money landing in
  // that account, so it raises the destination's balance (and shows as inflow).
  const credit = new Map<string, number>();
  const linkOf = new Map((categories ?? []).map((c) => [c.id, c.linked_account_id]));
  if (categories?.length) {
    for (const t of txns) {
      if (t.direction !== "outflow" || t.is_transfer || !t.category_id) continue;
      const dest = linkOf.get(t.category_id);
      if (!dest) continue;
      credit.set(dest, (credit.get(dest) ?? 0) + t.amount);
    }
  }

  return accounts
    .map((account) => {
      const { inflow = 0, outflow = 0, delta = 0 } = agg.get(account.id) ?? {};
      const linked = credit.get(account.id) ?? 0;
      return {
        account,
        inflow: round2(inflow + linked),
        outflow: round2(outflow),
        net: round2(inflow + linked - outflow),
        balance: round2(account.opening_balance + delta + linked),
      };
    })
    .sort((a, b) => a.account.display_order - b.account.display_order);
}

// ---------------------------------------------------------------------------
// Debtors - people who owe you money. A debtor's balance is DERIVED from the
// ledger, never hand-typed: it's the still-outstanding receivable across every
// reimbursable expense you fronted for that person (a "Friend" expense is always
// reimbursable). Deriving it from transactions is what keeps "owed to me" from
// double-counting - there's a single source of truth (the expense), and the
// debtor is just a label that groups those expenses by person.
// ---------------------------------------------------------------------------
/** Still-outstanding receivable on one reimbursable expense (0 for anything else). */
export function outstandingReceivable(
  t: Pick<
    TransactionRow,
    "direction" | "amount" | "is_transfer" | "whose_expense" | "split_count" | "my_share" | "reimbursable" | "reimbursed_amount"
  >,
): number {
  if (t.direction !== "outflow" || t.is_transfer || !t.reimbursable) return 0;
  const owed = round2(t.amount - myAmount(t)); // the part meant to come back
  return round2(Math.max(0, owed - (t.reimbursed_amount ?? 0)));
}

export interface DebtorBalance {
  debtor: DebtorRow;
  outstanding: number; // derived from linked reimbursable expenses
}

/**
 * Split `amount` across parties, evenly by default with per-person overrides.
 * `overrides[i]` is a fixed amount for that party (null = take an even share of
 * whatever the fixed parties leave behind). Rounding drift is absorbed by the
 * last even party (or, if everyone's fixed, the last party) so the shares always
 * sum back to `amount` to the cent - which the receivable math relies on.
 */
export function splitShares(amount: number, overrides: Array<number | null>): number[] {
  const total = round2(amount);
  const fixedSum = round2(
    overrides.reduce<number>((s, o) => s + (o != null ? Math.max(0, o) : 0), 0),
  );
  const evenIdx = overrides.map((o, i) => (o == null ? i : -1)).filter((i) => i >= 0);
  const remainder = round2(Math.max(0, total - fixedSum));
  const each = evenIdx.length > 0 ? round2(remainder / evenIdx.length) : 0;
  const shares = overrides.map((o) => (o != null ? round2(Math.max(0, o)) : each));
  // Nudge the last flexible party so the shares reconcile to the cent.
  const drift = round2(total - shares.reduce((s, v) => s + v, 0));
  if (Math.abs(drift) >= 0.005) {
    const fixIdx = evenIdx.length > 0 ? evenIdx[evenIdx.length - 1] : shares.length - 1;
    if (fixIdx >= 0) shares[fixIdx] = round2(Math.max(0, shares[fixIdx] + drift));
  }
  return shares;
}

/**
 * Outstanding balance per debtor. Two sources, both derived from the ledger:
 *   - `links` (transaction_debtors): a person's slice of a split expense, less
 *     what they've paid back (`share − settled_amount`). This is how a bill
 *     shared across several people is attributed.
 *   - legacy single-debtor expenses (transactions.debtor_id) that carry NO link
 *     row: the whole reimbursable receivable goes to that one person.
 * A transaction that has link rows is owned by them; its debtor_id (if any) is
 * ignored here so nothing is counted twice.
 */
export function debtorBalances(
  txns: TransactionRow[],
  debtors: DebtorRow[],
  links: Pick<TransactionDebtorRow, "transaction_id" | "debtor_id" | "share" | "settled_amount">[] = [],
): DebtorBalance[] {
  const byDebtor = new Map<string, number>();
  const linkedTxnIds = new Set<string>();
  for (const l of links) {
    linkedTxnIds.add(l.transaction_id);
    const owed = round2(l.share - l.settled_amount);
    if (owed > 0.005) byDebtor.set(l.debtor_id, round2((byDebtor.get(l.debtor_id) ?? 0) + owed));
  }
  for (const t of txns) {
    if (!t.debtor_id || linkedTxnIds.has(t.id)) continue;
    const out = outstandingReceivable(t);
    if (out > 0.005) byDebtor.set(t.debtor_id, round2((byDebtor.get(t.debtor_id) ?? 0) + out));
  }
  return debtors.map((d) => ({ debtor: d, outstanding: byDebtor.get(d.id) ?? 0 }));
}

/** Total currently owed to you across all debtors (derived from the ledger). */
export function sumOwed(balances: DebtorBalance[]): number {
  return round2(balances.reduce((s, b) => s + b.outstanding, 0));
}

/**
 * Both halves of every "a creditor paid for something of mine" pair: the expense
 * outflow (not a transfer, carries creditor_id + repays_id) and the offsetting
 * borrow inflow it points to. A friend's money paid for it, so the pair nets to
 * zero on whatever account it's filed under and never appears on your real bank
 * statement - so per-account views and bank reconciliation leave both out.
 */
export function creditorPaidPairIds(
  txns: Pick<TransactionRow, "id" | "is_transfer" | "creditor_id" | "repays_id">[],
): Set<string> {
  const ids = new Set<string>();
  for (const t of txns) {
    if (!t.is_transfer && t.creditor_id && t.repays_id) {
      ids.add(t.id);
      ids.add(t.repays_id);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Creditors - people YOU owe. The exact mirror of debtors: a creditor's balance
// is DERIVED from the ledger, never hand-typed. The debt-creating event is a
// "borrow" - an excluded inflow (is_transfer, so it's not counted as income)
// tagged with creditor_id: the money you took is now sitting in your accounts
// (or paid for something of yours), owed back. Outstanding = borrowed − repaid.
//
// Three shapes carry creditor_id; direction + is_transfer + repays_id tell them
// apart, so nothing is ever double-counted:
//   borrow-inflow     inflow,  is_transfer, repays_id null → the liability
//   repayment-outflow outflow, is_transfer, repays_id set  → shrinks it (repaid)
//   expense-outflow   outflow, NOT transfer, repays_id null → your own spending
//                     (the "they paid for me directly" half; pairs with a borrow)
// ---------------------------------------------------------------------------
/** Still-outstanding payable on one borrow (0 for anything that isn't a borrow). */
export function outstandingPayable(
  t: Pick<TransactionRow, "direction" | "amount" | "is_transfer" | "creditor_id" | "repays_id" | "repaid_amount">,
): number {
  if (t.direction !== "inflow" || !t.is_transfer || !t.creditor_id || t.repays_id) return 0;
  return round2(Math.max(0, t.amount - (t.repaid_amount ?? 0)));
}

export interface CreditorBalance {
  creditor: CreditorRow;
  outstanding: number; // derived from linked borrows, minus what you've repaid
}

/** Outstanding balance per creditor, summed from the borrows linked to each. */
export function creditorBalances(
  txns: TransactionRow[],
  creditors: CreditorRow[],
): CreditorBalance[] {
  const byCreditor = new Map<string, number>();
  for (const t of txns) {
    if (!t.creditor_id) continue;
    const out = outstandingPayable(t);
    if (out > 0.005) byCreditor.set(t.creditor_id, round2((byCreditor.get(t.creditor_id) ?? 0) + out));
  }
  return creditors.map((c) => ({ creditor: c, outstanding: byCreditor.get(c.id) ?? 0 }));
}

/** Total you currently owe across all creditors (derived from the ledger). */
export function sumOwedByMe(balances: CreditorBalance[]): number {
  return round2(balances.reduce((s, b) => s + b.outstanding, 0));
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
