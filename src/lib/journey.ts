// Yearly Journey - a narrative, milestone-driven view of the financial life you
// have built since landing in the US. Everything here is a PURE derivation over
// the same ledger the rest of the app uses (no I/O), grouped by US-ANNIVERSARY
// year rather than calendar year: Year 1 runs from your arrival date to the day
// before your first anniversary, and so on. The anchor (arrival date) is read
// from the data itself - the earliest arrival deposit - so the grouping is always
// honest and needs no hand-entered config.

import { addDays, addYears, differenceInCalendarDays, format, parseISO } from "date-fns";
import type {
  AccountRow,
  CategoryRow,
  IndiaTransferRow,
  TransactionRow,
} from "@/lib/database.types";
import {
  isArrivalDeposit,
  isRefund,
  isSavingsTxn,
  monthlyBalances,
  myAmount,
  signed,
} from "@/lib/calc";
import { monthLabel } from "@/lib/format";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The day the journey started: the earliest ARRIVAL deposit (the wire from home /
 * forex card / opening cash you landed with), falling back to the earliest
 * transaction of any kind. Returns an ISO date, or null when there's no data.
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
 * Net worth at the END of `iso` (inclusive). Works backward from the ground-truth
 * current net worth by subtracting every net-worth-account flow dated after `iso`
 * - the same anchoring monthlyBalances() and the dashboard use, so the arc always
 * closes on today's real number.
 */
export function netWorthAsOf(
  txns: Pick<TransactionRow, "txn_date" | "account_id" | "direction" | "amount">[],
  nwIds: Set<string>,
  netWorth: number,
  iso: string,
): number {
  let after = 0;
  for (const t of txns) {
    if (!nwIds.has(t.account_id) || t.txn_date <= iso) continue;
    after += signed(t);
  }
  return round2(netWorth - after);
}

interface WindowStats {
  income: number; // earned income (arrival + refunds excluded), matching reconcile()
  arrival: number; // starting funds you landed with, if the window contains arrival
  spending: number; // your net share of non-savings consumption (refunds netted out)
  saved: number; // your share of savings / investment outflows
}

/** Income / spending / saved for the half-open window [start, endExclusive). */
function windowStats(txns: TransactionRow[], start: string, endExclusive: string): WindowStats {
  let income = 0;
  let arrival = 0;
  let spending = 0;
  let saved = 0;
  for (const t of txns) {
    if (t.txn_date < start || t.txn_date >= endExclusive) continue;
    if (t.is_transfer) continue;
    if (isRefund(t)) {
      spending -= t.amount; // a return reduces your net cost, not income
    } else if (t.direction === "inflow") {
      if (isArrivalDeposit(t)) arrival += t.amount;
      else income += t.amount;
    } else if (isSavingsTxn(t)) {
      saved += myAmount(t);
    } else {
      spending += myAmount(t);
    }
  }
  return { income: round2(income), arrival: round2(arrival), spending: round2(spending), saved: round2(saved) };
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

export interface JourneyYear {
  year: number; // 1-based (Year 1 = your first year in the US)
  label: string; // "Year 1"
  startISO: string; // first day of the year (arrival, then each anniversary)
  endISO: string; // inclusive last day (day before next anniversary; today if current)
  isCurrent: boolean;
  days: number; // days elapsed in this year so far
  startNetWorth: number;
  endNetWorth: number;
  growth: number; // endNetWorth − startNetWorth
  growthPct: number | null; // null when starting from ~zero
  income: number;
  spending: number;
  saved: number;
  net: number; // income − spending − saved (money kept)
  savingsRate: number | null; // net ÷ income
  indiaReceivedUsd: number;
  indiaSentUsd: number;
  indiaNetUsd: number; // received − sent (money that flowed in from home)
  topCategory: { name: string; total: number } | null;
  months: number; // distinct months with activity
}

export interface NetWorthPoint {
  month: string; // 'YYYY-MM'
  label: string; // 'Aug'
  fullLabel: string; // 'Aug 2025'
  netWorth: number;
  year: number; // which journey-year this month falls in
}

export interface Milestone {
  date: string; // ISO
  kind: "arrival" | "networth" | "anniversary" | "peak";
  title: string;
  detail?: string;
  amount?: number;
}

export interface Journey {
  anchor: string; // arrival date (ISO)
  today: string;
  daysInUS: number;
  currentYear: number; // the year number you're currently living
  dayInCurrentYear: number;
  currentNetWorth: number;
  arrivalCapital: number; // what you landed with
  builtSinceArrival: number; // currentNetWorth − arrivalCapital
  peak: { netWorth: number; month: string; label: string } | null;
  years: JourneyYear[]; // newest first
  trajectory: NetWorthPoint[]; // oldest → newest
  milestones: Milestone[]; // oldest → newest
}

const NW_THRESHOLDS = [1000, 5000, 10000, 25000, 50000, 100000, 250000];

/**
 * Assemble the whole journey. `netWorth` is the canonical available-funds net
 * worth (sum of accounts flagged into net worth) - the same figure the dashboard
 * and reconcile() use. `today` is passed in (todayISO()) to keep this pure.
 */
export function buildJourney(
  txns: TransactionRow[],
  accounts: AccountRow[],
  india: IndiaTransferRow[],
  categories: CategoryRow[],
  netWorth: number,
  today: string,
): Journey | null {
  const anchor = journeyAnchor(txns);
  if (!anchor || !txns.length) return null;

  const nwIds = new Set(accounts.filter((a) => a.include_in_net_worth).map((a) => a.id));
  const anchorDate = parseISO(anchor);

  // Year-start dates: arrival, then each anniversary that has already happened.
  const starts: string[] = [];
  for (let k = 0; ; k++) {
    const s = format(addYears(anchorDate, k), "yyyy-MM-dd");
    if (s > today) break;
    starts.push(s);
  }
  if (!starts.length) starts.push(anchor); // defensive: anchor should always be ≤ today

  const yearIndexOf = (iso: string) => {
    let idx = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= iso) idx = i;
    return idx + 1;
  };

  // Per-year rollups (built oldest → newest, returned newest first).
  const years: JourneyYear[] = [];
  let prevEndNetWorth = netWorthAsOf(txns, nwIds, netWorth, format(addDays(anchorDate, -1), "yyyy-MM-dd"));
  const arrivalStartNetWorth = prevEndNetWorth; // ~0: your US net worth before landing

  for (let i = 0; i < starts.length; i++) {
    const startISO = starts[i];
    const isCurrent = i === starts.length - 1;
    const nextStartISO = format(addYears(anchorDate, i + 1), "yyyy-MM-dd");
    const endISO = isCurrent ? today : format(addDays(parseISO(nextStartISO), -1), "yyyy-MM-dd");

    const startNetWorth = i === 0 ? arrivalStartNetWorth : prevEndNetWorth;
    const endNetWorth = netWorthAsOf(txns, nwIds, netWorth, endISO);
    prevEndNetWorth = endNetWorth;

    const s = windowStats(txns, startISO, nextStartISO);
    const net = round2(s.income - s.spending - s.saved);

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

  // Net-worth trajectory: monthly closing balances (same engine the dashboard's
  // "Balance over time" uses), tagged with the journey-year each month falls in.
  const trajectory: NetWorthPoint[] = [...monthlyBalances(txns, nwIds, netWorth).entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, b]) => ({
      month,
      label: monthLabel(month).split(" ")[0],
      fullLabel: monthLabel(month),
      netWorth: b.closing,
      year: yearIndexOf(`${month}-01`),
    }));

  const peak = trajectory.reduce<Journey["peak"]>((best, p) => {
    if (!best || p.netWorth > best.netWorth) return { netWorth: p.netWorth, month: p.month, label: p.fullLabel };
    return best;
  }, null);

  const arrivalCapital = round2(
    txns.filter((t) => t.direction === "inflow" && isArrivalDeposit(t)).reduce((s, t) => s + t.amount, 0),
  );

  // Milestones - a data-driven narrative, oldest → newest.
  const milestones: Milestone[] = [];
  milestones.push({
    date: anchor,
    kind: "arrival",
    title: "Landed in the USA",
    detail: arrivalCapital > 0 ? "Started the journey with your arrival funds" : "Where the journey began",
    amount: arrivalCapital > 0 ? arrivalCapital : undefined,
  });
  // First month each net-worth threshold was crossed (only those actually reached).
  let ti = 0;
  for (const p of trajectory) {
    while (ti < NW_THRESHOLDS.length && p.netWorth >= NW_THRESHOLDS[ti]) {
      milestones.push({
        date: `${p.month}-15`,
        kind: "networth",
        title: `Crossed ${fmtK(NW_THRESHOLDS[ti])} net worth`,
        detail: `Reached in ${p.fullLabel}`,
        amount: NW_THRESHOLDS[ti],
      });
      ti++;
    }
  }
  // Anniversaries already reached (starts[1..] are past anniversaries).
  for (let k = 1; k < starts.length; k++) {
    milestones.push({
      date: starts[k],
      kind: "anniversary",
      title: `${k} year${k === 1 ? "" : "s"} in the USA`,
      detail: k === starts.length - 1 ? "A new chapter begins" : "Another year in the books",
    });
  }
  // Peak, only when you've since come off it (otherwise it's just "today").
  if (peak && trajectory.length && peak.month !== trajectory[trajectory.length - 1].month) {
    milestones.push({
      date: `${peak.month}-28`,
      kind: "peak",
      title: "All-time high net worth",
      detail: peak.label,
      amount: peak.netWorth,
    });
  }
  milestones.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank(a.kind) - rank(b.kind)));

  return {
    anchor,
    today,
    daysInUS: differenceInCalendarDays(parseISO(today), anchorDate) + 1,
    currentYear: starts.length,
    dayInCurrentYear: differenceInCalendarDays(parseISO(today), parseISO(starts[starts.length - 1])) + 1,
    currentNetWorth: round2(netWorth),
    arrivalCapital,
    builtSinceArrival: round2(netWorth - arrivalCapital),
    peak,
    years: years.reverse(),
    trajectory,
    milestones,
  };
}

function rank(kind: Milestone["kind"]): number {
  return kind === "arrival" ? 0 : kind === "anniversary" ? 1 : kind === "networth" ? 2 : 3;
}

/** Compact "$5k" / "$250k" label for round thresholds. */
function fmtK(n: number): string {
  return n >= 1000 ? `$${n / 1000}k` : `$${n}`;
}
