// Yearly Journey. A narrative, milestone-driven view of the financial life you
// have built since landing in the US. Everything here is a PURE derivation over
// the same ledger the rest of the app uses (no I/O), grouped by US-ANNIVERSARY
// year rather than calendar year: Year 1 runs from your arrival date to the day
// before your first anniversary, and so on.
//
// "Net worth" here means TOTAL net worth: every account (checking, savings,
// investments, cash) minus what you owe on cards. Savings and investments count,
// including money routed into an investment account by a category-linked outflow.
//
// The arrival date comes from Settings when set; otherwise it is read from the
// data itself (the earliest arrival deposit, then the earliest transaction).

import { addDays, addYears, differenceInCalendarDays, differenceInYears, format, parseISO } from "date-fns";
import type {
  CategoryRow,
  InflowTypeRow,
  IndiaTransferRow,
  TransactionRow,
} from "@/lib/database.types";
import { isArrivalDeposit, isRefund, isSavingsTxn, myAmount, signed } from "@/lib/calc";
import { fmtMoney, monthLabel } from "@/lib/format";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const isValidISO = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Fallback arrival date read from the data: the earliest ARRIVAL deposit (the
 * wire from home / forex card / opening cash you landed with), then the earliest
 * transaction of any kind. Returns an ISO date, or null when there is no data.
 */
export function journeyAnchor(
  txns: Pick<TransactionRow, "txn_date" | "description">[],
): string | null {
  let arrival: string | null = null;
  let earliest: string | null = null;
  for (const t of txns) {
    if (!earliest || t.txn_date < earliest) earliest = t.txn_date;
    if (isArrivalDeposit(t) && (!arrival || t.txn_date < arrival)) arrival = t.txn_date;
  }
  return arrival ?? earliest;
}

/**
 * The effect of one transaction on TOTAL net worth (all accounts). A normal
 * outflow lowers it; an inflow raises it; a transfer between two of your accounts
 * nets to zero across its two rows. A category-linked outflow (money routed into
 * an investment / savings account) leaves the source but lands in the linked
 * account, so it is net-neutral to total net worth.
 */
function wealthDelta(t: TransactionRow, linkedCatIds: Set<string>): number {
  let d = signed(t);
  if (t.direction === "outflow" && !t.is_transfer && t.category_id && linkedCatIds.has(t.category_id)) {
    d += t.amount; // the money re-appears in the linked destination account
  }
  return d;
}

/**
 * Total net worth at the END of `iso` (inclusive). Works backward from the
 * ground-truth current total by subtracting every flow dated after `iso`, so the
 * arc always closes on today's real number.
 */
export function netWorthAsOf(
  txns: TransactionRow[],
  linkedCatIds: Set<string>,
  total: number,
  iso: string,
): number {
  let after = 0;
  for (const t of txns) {
    if (t.txn_date <= iso) continue;
    after += wealthDelta(t, linkedCatIds);
  }
  return round2(total - after);
}

interface WindowStats {
  income: number; // earned income (arrival + refunds excluded), matching reconcile()
  spending: number; // your net share of non-savings consumption (refunds netted out)
  saved: number; // your share of savings / investment outflows
}

/** Income / spending / saved for the half-open window [start, endExclusive). */
function windowStats(txns: TransactionRow[], start: string, endExclusive: string): WindowStats {
  let income = 0;
  let spending = 0;
  let saved = 0;
  for (const t of txns) {
    if (t.txn_date < start || t.txn_date >= endExclusive) continue;
    if (t.is_transfer) continue;
    if (isRefund(t)) spending -= t.amount;
    else if (t.direction === "inflow") {
      if (!isArrivalDeposit(t)) income += t.amount;
    } else if (isSavingsTxn(t)) saved += myAmount(t);
    else spending += myAmount(t);
  }
  return { income: round2(income), spending: round2(spending), saved: round2(saved) };
}

/** Top spending category (your share) within [start, endExclusive). */
function topCategory(
  txns: TransactionRow[],
  categories: CategoryRow[],
  start: string,
  endExclusive: string,
): { name: string; total: number } | null {
  const byId = new Map(categories.map((c) => [c.id, c.name]));
  const agg = new Map<string, number>();
  for (const t of txns) {
    if (t.txn_date < start || t.txn_date >= endExclusive) continue;
    if (t.direction !== "outflow" || t.is_transfer || isSavingsTxn(t)) continue;
    const share = myAmount(t);
    if (share <= 0) continue;
    const key = t.category_id ?? "__none__";
    agg.set(key, round2((agg.get(key) ?? 0) + share));
  }
  let best: { name: string; total: number } | null = null;
  for (const [id, total] of agg) {
    if (!best || total > best.total) best = { name: id === "__none__" ? "Uncategorized" : byId.get(id) ?? "Uncategorized", total };
  }
  return best;
}

/**
 * Your actual average monthly savings = earned income minus consumption, summed
 * across every COMPLETED month and divided by the number of those months (the
 * in-progress current month is excluded so a few days do not distort it). This
 * is a plain fact from the ledger, not a smoothed window. It ignores India
 * transfers, so a one-off tuition receipt raises the target (the gap) without
 * touching this figure. Investing is retained (part of net worth), so it is not
 * treated as spending. Returns null when there is no completed-month data.
 */
function averageMonthlySavings(txns: TransactionRow[], today: string): number | null {
  const byMonth = new Map<string, number>();
  for (const t of txns) {
    if (t.is_transfer) continue;
    const m = t.txn_date.slice(0, 7);
    let v = byMonth.get(m) ?? 0;
    if (isRefund(t)) v += t.amount; // a refund lifts net savings (returned spend)
    else if (t.direction === "inflow") {
      if (!isArrivalDeposit(t)) v += t.amount; // earned income (arrival is starting funds)
    } else if (!isSavingsTxn(t)) {
      v -= myAmount(t); // consumption only; investing stays in net worth
    }
    byMonth.set(m, round2(v));
  }
  const currentMonth = today.slice(0, 7);
  let months = [...byMonth.keys()].filter((m) => m < currentMonth);
  if (!months.length) months = [...byMonth.keys()]; // fall back if only this month has data
  if (!months.length) return null;
  const sum = months.reduce((s, m) => s + (byMonth.get(m) ?? 0), 0);
  return round2(sum / months.length);
}

/** Earliest transaction matching a predicate (by txn_date, then created_at). */
function earliestTxn(txns: TransactionRow[], pred: (t: TransactionRow) => boolean): TransactionRow | null {
  let best: TransactionRow | null = null;
  for (const t of txns) {
    if (!pred(t)) continue;
    if (!best || t.txn_date < best.txn_date || (t.txn_date === best.txn_date && t.created_at < best.created_at)) best = t;
  }
  return best;
}

const TRIP_RE = /\b(trav|trip|flight|vacation|holiday|tour|explore|getaway)\b/i;

export interface JourneyYear {
  year: number; // 1-based (Year 1 = your first year in the US)
  label: string; // "Year 1"
  startISO: string; // first day of the year (arrival, then each anniversary)
  endISO: string; // inclusive last day (day before next anniversary; today if current)
  isCurrent: boolean;
  days: number; // days elapsed in this year so far
  startNetWorth: number;
  endNetWorth: number;
  trueStartNetWorth: number; // startNetWorth minus family debt at the year's start
  trueEndNetWorth: number; // endNetWorth minus family debt at the year's end
  growth: number; // endNetWorth minus startNetWorth
  growthPct: number | null; // null when starting from about zero
  income: number;
  spending: number;
  saved: number;
  net: number; // income minus spending minus saved (money kept)
  savingsRate: number | null; // net over income
  indiaReceivedUsd: number;
  indiaSentUsd: number;
  indiaNetUsd: number; // received minus sent (money that flowed in from home)
  topCategory: { name: string; total: number } | null;
  months: number; // distinct months with activity
}

export interface NetWorthPoint {
  month: string; // 'YYYY-MM'
  label: string; // 'Aug'
  fullLabel: string; // 'Aug 2025'
  netWorth: number; // US total across every account (what you own)
  debt: number; // family debt owed at this point (received minus sent, what you owe home)
  trueNetWorth: number; // netWorth minus debt (net position; debt free when this hits 0)
  year: number; // which journey-year this month falls in
}

export type MilestoneKind =
  | "arrival"
  | "income"
  | "invest"
  | "job"
  | "trip"
  | "networth"
  | "debtfree"
  | "anniversary"
  | "peak";

export interface Milestone {
  date: string; // ISO
  kind: MilestoneKind;
  title: string;
  detail?: string;
  amount?: number;
  year: number; // journey-year this milestone falls in
}

export interface DebtFreeGoal {
  targetAge: number;
  deadlineISO: string; // your birthday at the target age
  daysRemaining: number; // to the deadline (negative once it has passed)
  monthsRemaining: number; // fractional months to the deadline
  currentAge: number;
  gap: number; // how much true net worth must still rise (0 once debt free)
  requiredMonthly: number; // gap / monthsRemaining: how much to save each month
  actualMonthly: number | null; // your actual average monthly savings (null if too little data)
  projectedISO: string | null; // projected debt-free date at the recent pace (null if not improving)
  status: "debtfree" | "ahead" | "on_track" | "behind" | "off_track" | "overdue";
}

export interface Journey {
  anchor: string; // arrival date (ISO)
  anchorSource: "settings" | "derived"; // where the arrival date came from
  today: string;
  daysInUS: number;
  currentYear: number; // the year number you are currently living
  dayInCurrentYear: number;
  currentNetWorth: number; // US total across every account
  arrivalCapital: number; // what you landed with
  builtSinceArrival: number; // currentNetWorth minus arrivalCapital
  netDebt: number; // family support outstanding (received minus sent), mostly tuition
  trueNetWorth: number; // currentNetWorth minus netDebt (what you own minus what you owe home)
  debtFree: boolean; // true net worth is at or above zero (assets cover the family debt)
  gapToDebtFree: number; // how far below zero true net worth still is (0 once debt free)
  debtFreeReachedISO: string | null; // date true net worth first crossed zero, if it has
  goal: DebtFreeGoal | null; // debt-free-by-target-age plan (null when no birthdate is set)
  peak: { netWorth: number; month: string; label: string } | null;
  years: JourneyYear[]; // newest first
  trajectory: NetWorthPoint[]; // oldest to newest
  milestones: Milestone[]; // oldest to newest
}

const NW_THRESHOLDS = [1000, 5000, 10000, 25000, 50000, 100000, 250000];

/**
 * Assemble the whole journey. `netWorth` is the TOTAL net worth (sum of every
 * account balance, including savings and investments). `today` and
 * `arrivalOverride` are passed in to keep this pure.
 */
export function buildJourney(
  txns: TransactionRow[],
  india: IndiaTransferRow[],
  categories: CategoryRow[],
  inflowTypes: InflowTypeRow[],
  netWorth: number,
  today: string,
  arrivalOverride: string | null,
  birthDate: string | null,
  targetAge: number,
): Journey | null {
  if (!txns.length) return null;
  const derived = journeyAnchor(txns);
  const anchor = isValidISO(arrivalOverride) ? arrivalOverride : derived;
  if (!anchor) return null;
  const anchorSource: Journey["anchorSource"] = isValidISO(arrivalOverride) ? "settings" : "derived";

  const linkedCatIds = new Set(categories.filter((c) => c.linked_account_id).map((c) => c.id));
  const inflowName = new Map(inflowTypes.map((i) => [i.id, i.name]));
  const anchorDate = parseISO(anchor);

  // Family support carried as a debt: received from home minus sent back. Money
  // still held (e.g. a CD) is both an asset in net worth and a debt here, so it
  // cancels in true net worth; only support you have already spent (tuition, rent)
  // drags true net worth below zero.
  const signedDebt = (t: IndiaTransferRow) => (t.direction === "received" ? t.usd_amount : -t.usd_amount);
  const netDebtAsOf = (iso: string) =>
    round2(india.reduce((d, t) => (t.transfer_date <= iso ? d + signedDebt(t) : d), 0));
  const netDebtThroughMonth = (month: string) =>
    round2(india.reduce((d, t) => (t.transfer_date.slice(0, 7) <= month ? d + signedDebt(t) : d), 0));

  // Year-start dates: arrival, then each anniversary that has already happened.
  const starts: string[] = [];
  for (let k = 0; ; k++) {
    const s = format(addYears(anchorDate, k), "yyyy-MM-dd");
    if (s > today) break;
    starts.push(s);
  }
  if (!starts.length) starts.push(anchor);

  const yearIndexOf = (iso: string) => {
    let idx = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= iso) idx = i;
    return idx + 1;
  };

  // Per-year rollups (built oldest to newest, returned newest first).
  const years: JourneyYear[] = [];
  let prevEndNetWorth = netWorthAsOf(txns, linkedCatIds, netWorth, format(addDays(anchorDate, -1), "yyyy-MM-dd"));

  for (let i = 0; i < starts.length; i++) {
    const startISO = starts[i];
    const isCurrent = i === starts.length - 1;
    const nextStartISO = format(addYears(anchorDate, i + 1), "yyyy-MM-dd");
    const endISO = isCurrent ? today : format(addDays(parseISO(nextStartISO), -1), "yyyy-MM-dd");

    const startNetWorth = prevEndNetWorth;
    const endNetWorth = netWorthAsOf(txns, linkedCatIds, netWorth, endISO);
    prevEndNetWorth = endNetWorth;

    const trueStartNetWorth = round2(startNetWorth - netDebtAsOf(format(addDays(parseISO(startISO), -1), "yyyy-MM-dd")));
    const trueEndNetWorth = round2(endNetWorth - netDebtAsOf(endISO));

    const s = windowStats(txns, startISO, nextStartISO);
    // Money kept from income = what you earned minus what you consumed. Savings
    // are NOT subtracted: money moved into investments is still yours and still
    // part of net worth. (The old "income minus spending minus saved" could go
    // negative even in a year your net worth grew, which made no sense.)
    const net = round2(s.income - s.spending);

    let rUsd = 0;
    let sUsd = 0;
    for (const t of india) {
      if (t.transfer_date < startISO || t.transfer_date >= nextStartISO) continue;
      if (t.direction === "received") rUsd += t.usd_amount;
      else sUsd += t.usd_amount;
    }

    const monthsSet = new Set<string>();
    for (const t of txns) {
      if (t.txn_date < startISO || t.txn_date >= nextStartISO || t.is_transfer) continue;
      monthsSet.add(t.txn_date.slice(0, 7));
    }

    const growth = round2(endNetWorth - startNetWorth);
    years.push({
      year: i + 1,
      label: `Year ${i + 1}`,
      startISO,
      endISO,
      isCurrent,
      days: differenceInCalendarDays(parseISO(endISO), parseISO(startISO)) + 1,
      startNetWorth,
      endNetWorth,
      trueStartNetWorth,
      trueEndNetWorth,
      growth,
      growthPct: Math.abs(startNetWorth) > 1 ? round2((growth / Math.abs(startNetWorth)) * 100) : null,
      income: s.income,
      spending: s.spending,
      saved: s.saved,
      net,
      savingsRate: s.income > 0 ? round2((net / s.income) * 100) : null,
      indiaReceivedUsd: round2(rUsd),
      indiaSentUsd: round2(sUsd),
      indiaNetUsd: round2(rUsd - sUsd),
      topCategory: topCategory(txns, categories, startISO, nextStartISO),
      months: monthsSet.size,
    });
  }

  // Total-net-worth trajectory: monthly closing totals, tagged by journey-year.
  const byMonth = new Map<string, number>();
  let totalDelta = 0;
  for (const t of txns) {
    const d = wealthDelta(t, linkedCatIds);
    totalDelta += d;
    const k = t.txn_date.slice(0, 7);
    byMonth.set(k, round2((byMonth.get(k) ?? 0) + d));
  }
  let running = round2(netWorth - totalDelta);
  const trajectory: NetWorthPoint[] = [...byMonth.keys()].sort().map((month) => {
    running = round2(running + (byMonth.get(month) ?? 0));
    const debt = netDebtThroughMonth(month);
    return {
      month,
      label: monthLabel(month).split(" ")[0],
      fullLabel: monthLabel(month),
      netWorth: running,
      debt,
      trueNetWorth: round2(running - debt),
      year: yearIndexOf(`${month}-01`),
    };
  });

  const peak = trajectory.reduce<Journey["peak"]>((best, p) => {
    if (!best || p.netWorth > best.netWorth) return { netWorth: p.netWorth, month: p.month, label: p.fullLabel };
    return best;
  }, null);

  const arrivalCapital = round2(
    txns.filter((t) => t.direction === "inflow" && isArrivalDeposit(t)).reduce((s, t) => s + t.amount, 0),
  );

  // True, all-in net worth: what you own minus the family support you still owe.
  const netDebt = netDebtAsOf(today);
  const trueNetWorth = round2(netWorth - netDebt);
  const debtFree = trueNetWorth >= 0;
  const gapToDebtFree = round2(Math.max(0, -trueNetWorth));
  const firstDebtFreeMonth = trajectory.find((p) => p.trueNetWorth >= 0);
  const debtFreeReachedISO = debtFree && firstDebtFreeMonth ? `${firstDebtFreeMonth.month}-15` : null;

  // Debt-free-by-target-age goal. Everything here is derived, so it moves with
  // the ledger: a new India transfer raises netDebt -> the gap and required
  // monthly savings rise; earning or repaying lowers them.
  let goal: DebtFreeGoal | null = null;
  if (isValidISO(birthDate)) {
    const bd = parseISO(birthDate);
    const deadline = addYears(bd, targetAge);
    const deadlineISO = format(deadline, "yyyy-MM-dd");
    const todayDate = parseISO(today);
    const daysRemaining = differenceInCalendarDays(deadline, todayDate);
    const monthsRemaining = daysRemaining / 30.4375;
    const currentAge = differenceInYears(todayDate, bd);
    const requiredMonthly = gapToDebtFree > 0 && monthsRemaining > 0 ? round2(gapToDebtFree / monthsRemaining) : 0;
    // What you actually save each month, on average (income minus spending over
    // your whole time here). A plain fact, compared directly against the required
    // amount. A lumpy tuition transfer raises the gap (and the required amount)
    // without touching this figure.
    const actualMonthly = averageMonthlySavings(txns, today);
    let projectedISO: string | null = null;
    let projectedDate: Date | null = null;
    if (!debtFree && actualMonthly != null && actualMonthly > 0) {
      const monthsToZero = gapToDebtFree / actualMonthly;
      projectedDate = addDays(todayDate, Math.round(monthsToZero * 30.4375));
      projectedISO = format(projectedDate, "yyyy-MM-dd");
    }
    // "Ahead" when the projected finish clears the deadline with real slack
    // (at least ~10% of the remaining time, min 60 days); "on track" when it
    // lands just in time; "behind" when it misses.
    let status: DebtFreeGoal["status"];
    if (debtFree) status = "debtfree";
    else if (daysRemaining < 0) status = "overdue";
    else if (actualMonthly == null || actualMonthly <= 0 || projectedDate == null) status = "off_track";
    else {
      const slackDays = differenceInCalendarDays(deadline, projectedDate);
      const threshold = Math.max(60, daysRemaining * 0.1);
      status = slackDays < 0 ? "behind" : slackDays >= threshold ? "ahead" : "on_track";
    }
    goal = {
      targetAge,
      deadlineISO,
      daysRemaining,
      monthsRemaining: round2(monthsRemaining),
      currentAge,
      gap: gapToDebtFree,
      requiredMonthly,
      actualMonthly,
      projectedISO,
      status,
    };
  }

  // ------- Milestones: a data-driven, sentimental narrative (oldest first) ----
  const milestones: Milestone[] = [];
  const push = (date: string, kind: MilestoneKind, title: string, detail?: string, amount?: number) =>
    milestones.push({ date, kind, title, detail, amount, year: yearIndexOf(date) });

  push(
    anchor,
    "arrival",
    "Landed in the USA",
    arrivalCapital > 0 ? "The journey begins, with the funds you brought" : "The journey begins",
    arrivalCapital > 0 ? arrivalCapital : undefined,
  );

  // First dollars earned (any real income, arrival and refunds excluded).
  const firstIncome = earliestTxn(
    txns,
    (t) => t.direction === "inflow" && !t.is_transfer && !isRefund(t) && !isArrivalDeposit(t),
  );
  if (firstIncome) {
    const src = firstIncome.inflow_type_id ? inflowName.get(firstIncome.inflow_type_id) : null;
    push(firstIncome.txn_date, "income", "Earned your first dollars", src ? `From ${src}` : "Your first income in America", firstIncome.amount);
  }

  // First paycheck from each real job / paycheck source (a new source landing is
  // "you found an internship / an on-campus job"). Skip the source that already
  // owns the first-dollars milestone so it is not shown twice.
  const paycheckTypeIds = new Set(inflowTypes.filter((i) => i.is_paycheck).map((i) => i.id));
  const firstIncomeTypeId = firstIncome?.inflow_type_id ?? null;
  const seenTypes = new Set<string>();
  for (const t of [...txns].sort((a, b) => (a.txn_date < b.txn_date ? -1 : a.txn_date > b.txn_date ? 1 : a.created_at < b.created_at ? -1 : 1))) {
    if (t.direction !== "inflow" || t.is_transfer || isRefund(t) || isArrivalDeposit(t)) continue;
    const id = t.inflow_type_id;
    if (!id || !paycheckTypeIds.has(id) || seenTypes.has(id)) continue;
    seenTypes.add(id);
    if (id === firstIncomeTypeId) continue; // already covered by "first dollars"
    const name = inflowName.get(id) ?? "a new job";
    push(t.txn_date, "job", `First paycheck from ${name}`, "A new income source begins", t.amount);
  }

  // First dollars invested / set aside.
  const firstInvest = earliestTxn(txns, (t) => t.direction === "outflow" && !t.is_transfer && isSavingsTxn(t) && myAmount(t) > 0);
  if (firstInvest) {
    push(firstInvest.txn_date, "invest", "Invested your first dollars", firstInvest.description || "Money set aside for the future", myAmount(firstInvest));
  }

  // First trip (first spend in a travel-ish category).
  const tripCatIds = new Set(categories.filter((c) => TRIP_RE.test(c.name)).map((c) => c.id));
  if (tripCatIds.size) {
    const firstTrip = earliestTxn(
      txns,
      (t) => t.direction === "outflow" && !t.is_transfer && !!t.category_id && tripCatIds.has(t.category_id) && myAmount(t) > 0,
    );
    if (firstTrip) push(firstTrip.txn_date, "trip", "Your first trip", firstTrip.description || "Time to explore", myAmount(firstTrip));
  }

  // "Built" milestones: net worth grown BEYOND the funds you arrived with, so
  // money from home never creates a hollow "crossed $Xk" milestone on day one.
  // Measured on (net worth minus arrival capital), which starts at zero on
  // arrival and only climbs once you build past your starting stake.
  //
  // Dated at TRANSACTION granularity (a running total walked in date order), not
  // the monthly close, so several thresholds crossed in one busy month get their
  // real, distinct dates. If a single transaction leaps past more than one
  // threshold at once, they collapse into one milestone rather than stacking on
  // the same day.
  const beyond = arrivalCapital > 0;
  const chron = [...txns].sort((a, b) =>
    a.txn_date < b.txn_date ? -1 : a.txn_date > b.txn_date ? 1 : a.created_at.localeCompare(b.created_at),
  );
  let builtRunning = round2(netWorth - totalDelta); // net worth before the first transaction
  let bi = 0;
  while (bi < NW_THRESHOLDS.length && builtRunning - arrivalCapital >= NW_THRESHOLDS[bi]) bi++;
  for (const t of chron) {
    builtRunning = round2(builtRunning + wealthDelta(t, linkedCatIds));
    const built = builtRunning - arrivalCapital;
    const crossed: number[] = [];
    while (bi < NW_THRESHOLDS.length && built >= NW_THRESHOLDS[bi]) {
      crossed.push(NW_THRESHOLDS[bi]);
      bi++;
    }
    if (!crossed.length) continue;
    const top = crossed[crossed.length - 1];
    const passed = crossed.slice(0, -1);
    push(
      t.txn_date,
      "networth",
      beyond ? `Built ${fmtK(top)} beyond your arrival funds` : `Crossed ${fmtK(top)} net worth`,
      passed.length
        ? `Net worth reached ${fmtMoney(builtRunning)}, passing ${passed.map(fmtK).join(" and ")} the same day`
        : `Net worth reached ${fmtMoney(builtRunning)}`,
    );
  }

  // Anniversaries already reached.
  for (let k = 1; k < starts.length; k++) {
    push(starts[k], "anniversary", `${k} year${k === 1 ? "" : "s"} in the USA`, k === starts.length - 1 ? "A new chapter begins" : "Another year in the books");
  }

  // Debt free: the day true net worth first crossed zero, i.e. what you own can
  // finally cover everything you owe home. The single biggest milestone there is.
  if (debtFreeReachedISO) {
    push(
      debtFreeReachedISO,
      "debtfree",
      "Became debt free",
      "True net worth crossed $0: what you own now covers everything you owe home",
    );
  }

  // Peak, only when you have since come off it.
  if (peak && trajectory.length && peak.month !== trajectory[trajectory.length - 1].month) {
    push(`${peak.month}-28`, "peak", "All-time high net worth", peak.label, peak.netWorth);
  }

  milestones.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank(a.kind) - rank(b.kind)));

  return {
    anchor,
    anchorSource,
    today,
    daysInUS: differenceInCalendarDays(parseISO(today), anchorDate) + 1,
    currentYear: starts.length,
    dayInCurrentYear: differenceInCalendarDays(parseISO(today), parseISO(starts[starts.length - 1])) + 1,
    currentNetWorth: round2(netWorth),
    arrivalCapital,
    builtSinceArrival: round2(netWorth - arrivalCapital),
    netDebt,
    trueNetWorth,
    debtFree,
    gapToDebtFree,
    debtFreeReachedISO,
    goal,
    peak,
    years: years.reverse(),
    trajectory,
    milestones,
  };
}

function rank(kind: MilestoneKind): number {
  const order: MilestoneKind[] = ["arrival", "income", "job", "invest", "trip", "networth", "debtfree", "anniversary", "peak"];
  return order.indexOf(kind);
}

/** Compact "$5k" / "$250k" label for round thresholds. */
function fmtK(n: number): string {
  return n >= 1000 ? `$${n / 1000}k` : `$${n}`;
}
