import "server-only";
import ExcelJS from "exceljs";
import type {
  AccountRow,
  CategoryRow,
  DebtorRow,
  IndiaTransferRow,
  InflowTypeRow,
  OtherIncomeRow,
  SettingsRow,
  TransactionRow,
} from "@/lib/database.types";
import {
  accountActivity,
  budgetGroupsByMonth,
  categoryTotals,
  fxSummary,
  incomeByMonth,
  isArrivalDeposit,
  monthlyBalances,
  monthlyBudget,
  monthlyBudgetStatus,
  monthlyCashFlow,
  myAmount,
  reconcile,
  signed,
  sumOwed,
} from "@/lib/calc";
import { fmtDate, monthKey, monthLabel, todayISO } from "@/lib/format";
import { injectCharts, type ChartSpec } from "@/lib/xlsx-charts";

// Chart series palette (hex, no '#'), matching the app's Aurora tokens.
const CHART_PALETTE = [
  "4F46E5", "7C3AED", "06B6D4", "0EA5E9", "10B981", "F59E0B",
  "EC4899", "8B5CF6", "14B8A6", "F97316", "6366F1", "84CC16",
];
const chartColor = (i: number) => CHART_PALETTE[i % CHART_PALETTE.length];

/** Everything the export needs - the raw rows behind every page. */
export interface ExportData {
  settings: SettingsRow | null;
  accounts: AccountRow[];
  categories: CategoryRow[];
  inflowTypes: InflowTypeRow[];
  debtors: DebtorRow[];
  transactions: TransactionRow[];
  indiaTransfers: IndiaTransferRow[];
  otherIncome: OtherIncomeRow[];
}

// --- palette (matches the app's Aurora tokens) & number formats ---------------
const BRAND = "FF4F46E5"; // indigo
const WHITE = "FFFFFFFF";
const SLATE = "FF64748B";
const INK = "FF0F172A";
const POS = "FF16A34A"; // green
const NEG = "FFDC2626"; // red
const ZEBRA = "FFF7F8FC"; // faint tint for even rows
const RULE = "FFCBD5E1"; // border grey

const MONEY = '$#,##0.00';
const INRFMT = '"₹"#,##0';
const PCT = "0.0%";
const RATE = "#,##0.0000";
const INT = "#,##0";
const DATEFMT = "mmm d, yyyy";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const yn = (b: boolean) => (b ? "Yes" : "");

const TYPE_LABELS: Record<string, string> = {
  checking: "Checking",
  credit_card: "Credit card",
  savings: "Savings",
  cash: "Cash",
  investment: "Investment",
};

/** ISO date -> a real Excel date at local noon (no timezone drift). */
function xlDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y) return null;
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

type ColDef = {
  header: string;
  key: string;
  width: number;
  numFmt?: string;
  align?: "left" | "right" | "center";
};

/** Add a filterable, frozen-header data sheet and return it. */
function dataSheet(wb: ExcelJS.Workbook, name: string, tab: string, cols: ColDef[]) {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: tab } },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = cols.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: {
      numFmt: c.numFmt,
      alignment: c.align ? { horizontal: c.align } : undefined,
    },
  }));
  const h = ws.getRow(1);
  h.height = 22;
  h.font = { bold: true, color: { argb: WHITE }, size: 11 };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tab } };
  h.alignment = { vertical: "middle" };
  return ws;
}

/** Faint striping on even data rows for readability. */
function zebra(ws: ExcelJS.Worksheet, firstRow: number, lastRow: number, ncols: number) {
  for (let r = firstRow; r <= lastRow; r++) {
    if (r % 2 === 0) {
      for (let c = 1; c <= ncols; c++) {
        ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    }
  }
}

/** Bold "Total" row with SUBTOTAL formulas that respect active filters. */
function totalsRow(
  ws: ExcelJS.Worksheet,
  labelKey: string,
  sumKeys: string[],
  firstDataRow: number,
  lastDataRow: number,
) {
  if (lastDataRow < firstDataRow) return;
  const row = ws.addRow({ [labelKey]: "Total" });
  for (const key of sumKeys) {
    const col = ws.getColumn(key);
    const L = col.letter;
    ws.getCell(`${L}${row.number}`).value = { formula: `SUBTOTAL(109,${L}${firstDataRow}:${L}${lastDataRow})` };
  }
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.border = { top: { style: "thin", color: { argb: RULE } } };
  });
}

/** Color a column's data cells green/red by sign. */
function colorBySign(ws: ExcelJS.Worksheet, key: string, firstRow: number, lastRow: number) {
  const L = ws.getColumn(key).letter;
  for (let r = firstRow; r <= lastRow; r++) {
    const cell = ws.getCell(`${L}${r}`);
    const v = typeof cell.value === "number" ? cell.value : 0;
    if (v !== 0) cell.font = { color: { argb: v >= 0 ? POS : NEG } };
  }
}

function autofilter(ws: ExcelJS.Worksheet, ncols: number, lastDataRow: number) {
  if (lastDataRow < 1) return;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ncols } };
}

// ----------------------------------------------------------------------------
// Overview sheet (KPIs + reconciliation + income by source)
// ----------------------------------------------------------------------------
function buildOverview(
  wb: ExcelJS.Workbook,
  data: ExportData,
  netWorth: number,
) {
  const ws = wb.addWorksheet("Overview", { properties: { tabColor: { argb: BRAND } } });
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 20;

  ws.mergeCells("A1:C1");
  const title = ws.getCell("A1");
  title.value = "Finance Tracker";
  title.font = { bold: true, size: 20, color: { argb: BRAND } };
  ws.getRow(1).height = 30;
  ws.mergeCells("A2:C2");
  const sub = ws.getCell("A2");
  sub.value = `Complete data export · ${fmtDate(todayISO(), "long")}`;
  sub.font = { italic: true, size: 11, color: { argb: SLATE } };

  let row = 4;
  const section = (label: string) => {
    for (let c = 1; c <= 3; c++) {
      ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
    }
    const a = ws.getCell(row, 1);
    a.value = label;
    a.font = { bold: true, size: 12, color: { argb: BRAND } };
    row++;
  };
  const kv = (label: string, value: number, opts: { bold?: boolean; color?: string } = {}) => {
    ws.getCell(row, 1).value = label;
    const v = ws.getCell(row, 2);
    v.value = r2(value);
    v.numFmt = MONEY;
    if (opts.bold) {
      ws.getCell(row, 1).font = { bold: true };
      v.font = { bold: true, color: opts.color ? { argb: opts.color } : undefined };
    } else if (opts.color) {
      v.font = { color: { argb: opts.color } };
    }
    row++;
  };

  const recon = reconcile(data.transactions, netWorth);
  const totalWealth = netWorth + recon.savings;
  const totalOwed = r2(sumOwed(data.debtors) + recon.reimbursable);

  section("Snapshot");
  kv("Available funds (net worth)", netWorth);
  kv("Total wealth (incl. savings)", totalWealth);
  kv("Total income", recon.income);
  kv("Total spent", recon.spending);
  kv("Saved / invested", recon.savings);
  kv("Owed to you", totalOwed);
  row++;

  section("How your balance adds up");
  kv("Income", recon.income);
  kv("   of which arrival capital", recon.arrivalCapital);
  kv("− Spending", recon.spending);
  kv("− Saved / invested", recon.savings);
  kv("− Owed back (reimbursable)", recon.reimbursable);
  kv("− Unreconciled", recon.settled);
  kv("= Net worth", recon.currentBalance, { bold: true });
  row++;

  // Income by source - mirrors the Dashboard income breakdown modal.
  const inflowName = new Map(data.inflowTypes.map((i) => [i.id, i.name]));
  const agg = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.direction !== "inflow" || t.is_transfer || t.category_id) continue;
    const label = isArrivalDeposit(t)
      ? "Arrival capital"
      : t.inflow_type_id
        ? inflowName.get(t.inflow_type_id) ?? "Other"
        : "Other";
    agg.set(label, r2((agg.get(label) ?? 0) + t.amount));
  }
  const sources = [...agg.entries()].sort((a, b) => b[1] - a[1]);
  if (sources.length) {
    section("Income by source");
    for (const [label, total] of sources) kv(label, total);
  }
}

// ----------------------------------------------------------------------------
// Charts - NATIVE, interactive Excel charts. The chart data lives in a hidden
// "Chart data" sheet; the charts (spliced into the zip by injectCharts) point at
// those cells, so they're real editable Excel charts, not pictures. Rendering
// and labels are Excel's own - no font/rasterization concerns.
// ----------------------------------------------------------------------------
const SD = "'Chart data'!";
const CHART_W = 720;
const CHART_H = 360;
const CHART_GAP = 20; // rows between stacked charts

interface PreparedCharts {
  specs: ChartSpec[];
  fill: (ws: ExcelJS.Worksheet) => void;
  titles: { row: number; text: string }[];
}

function prepareCharts(data: ExportData, netWorth: number): PreparedCharts {
  const money = "$#,##0";

  // Datasets ------------------------------------------------------------------
  const nwIds = new Set(data.accounts.filter((a) => a.include_in_net_worth).map((a) => a.id));
  const balances = monthlyBalances(data.transactions, nwIds, netWorth);
  const nw = [...balances.keys()].sort().map((k) => ({ label: monthLabel(k).split(" ")[0], value: balances.get(k)!.closing }));

  const cf = monthlyCashFlow(data.transactions).map((m) => ({ label: m.label.split(" ")[0], value: m.net }));

  const catsAll = categoryTotals(data.transactions, data.categories).filter((c) => c.total > 0);
  const cat = catsAll.slice(0, 8).map((c, i) => ({ label: c.name, value: c.total, color: chartColor(i) }));
  const otherTotal = r2(catsAll.slice(8).reduce((s, c) => s + c.total, 0));
  if (otherTotal > 0) cat.push({ label: "Other", value: otherTotal, color: "94A3B8" });

  const groups = budgetGroupsByMonth(data.transactions).map((g) => ({
    label: g.label.split(" ")[0], needs: g.needs, wants: g.wants, savings: g.savings, unclassified: g.unclassified,
  }));

  const inflowName = new Map(data.inflowTypes.map((i) => [i.id, i.name]));
  const agg = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.direction !== "inflow" || t.is_transfer || t.category_id) continue;
    const label = isArrivalDeposit(t) ? "Arrival capital" : t.inflow_type_id ? inflowName.get(t.inflow_type_id) ?? "Other" : "Other";
    agg.set(label, r2((agg.get(label) ?? 0) + t.amount));
  }
  const income = [...agg.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: chartColor(i) }));

  const range = (col: string, n: number) => `${SD}$${col}$2:$${col}$${1 + n}`;
  const head = (col: string) => `${SD}$${col}$1`;

  // fill(): writes headers + data columns (money-formatted so chart labels show $).
  const fill = (ws: ExcelJS.Worksheet) => {
    const put = (r: number, c: number, v: string | number, fmt?: string) => {
      const cell = ws.getCell(r, c);
      cell.value = v;
      if (fmt) cell.numFmt = fmt;
    };
    put(1, 1, "Month"); put(1, 2, "Net worth");
    put(1, 4, "Month"); put(1, 5, "Net cash flow");
    put(1, 7, "Category"); put(1, 8, "Spending");
    put(1, 10, "Month"); put(1, 11, "Needs"); put(1, 12, "Wants"); put(1, 13, "Savings"); put(1, 14, "Unclassified");
    put(1, 16, "Source"); put(1, 17, "Income");
    nw.forEach((d, i) => { put(2 + i, 1, d.label); put(2 + i, 2, d.value, money); });
    cf.forEach((d, i) => { put(2 + i, 4, d.label); put(2 + i, 5, d.value, money); });
    cat.forEach((d, i) => { put(2 + i, 7, d.label); put(2 + i, 8, d.value, money); });
    groups.forEach((d, i) => { put(2 + i, 10, d.label); put(2 + i, 11, d.needs, money); put(2 + i, 12, d.wants, money); put(2 + i, 13, d.savings, money); put(2 + i, 14, d.unclassified, money); });
    income.forEach((d, i) => { put(2 + i, 16, d.label); put(2 + i, 17, d.value, money); });
  };

  // Specs. anchorRow (0-based) == the title's 1-based row, so the chart sits one
  // row below its title.
  const specs: ChartSpec[] = [];
  const titles: { row: number; text: string }[] = [];
  let slot = 0;
  const place = (text: string) => {
    const titleRow = 2 + slot * CHART_GAP;
    titles.push({ row: titleRow, text });
    slot++;
    return titleRow;
  };

  if (nw.length)
    specs.push({
      kind: "line", title: "Net worth over time",
      series: [{ titleRef: head("B"), catRef: range("A", nw.length), valRef: range("B", nw.length), color: "4F46E5" }],
      anchorCol: 1, anchorRow: place("Net worth over time"), widthPx: CHART_W, heightPx: CHART_H,
    });
  if (cf.length)
    specs.push({
      kind: "col", title: "Monthly surplus / deficit",
      series: [{ titleRef: head("E"), catRef: range("D", cf.length), valRef: range("E", cf.length) }],
      pointColors: cf.map((d) => (d.value >= 0 ? "16A34A" : "DC2626")), showVal: true,
      anchorCol: 1, anchorRow: place("Monthly surplus / deficit"), widthPx: CHART_W, heightPx: CHART_H,
    });
  if (cat.length)
    specs.push({
      kind: "doughnut", title: "Spending by category",
      series: [{ titleRef: head("H"), catRef: range("G", cat.length), valRef: range("H", cat.length) }],
      pointColors: cat.map((c) => c.color), showPercent: true,
      anchorCol: 1, anchorRow: place("Spending by category"), widthPx: CHART_W, heightPx: CHART_H,
    });
  if (groups.length)
    specs.push({
      kind: "colStacked", title: "50 / 30 / 20 spending by month",
      series: [
        { titleRef: head("K"), catRef: range("J", groups.length), valRef: range("K", groups.length), color: "4F46E5" },
        { titleRef: head("L"), catRef: range("J", groups.length), valRef: range("L", groups.length), color: "F59E0B" },
        { titleRef: head("M"), catRef: range("J", groups.length), valRef: range("M", groups.length), color: "10B981" },
        { titleRef: head("N"), catRef: range("J", groups.length), valRef: range("N", groups.length), color: "94A3B8" },
      ],
      anchorCol: 1, anchorRow: place("50 / 30 / 20 spending by month"), widthPx: CHART_W, heightPx: CHART_H,
    });
  if (income.length)
    specs.push({
      kind: "bar", title: "Income by source",
      series: [{ titleRef: head("Q"), catRef: range("P", income.length), valRef: range("Q", income.length) }],
      pointColors: income.map((d) => d.color), showVal: true,
      anchorCol: 1, anchorRow: place("Income by source"), widthPx: CHART_W, heightPx: CHART_H,
    });

  return { specs, fill, titles };
}

// The visible "Charts" tab: a header + a title above each (injected) chart frame.
function addChartsTitles(wb: ExcelJS.Workbook, titles: { row: number; text: string }[]) {
  const ws = wb.addWorksheet("Charts", { properties: { tabColor: { argb: "FF7C3AED" } } });
  ws.getColumn(1).width = 2;
  ws.mergeCells("A1:M1");
  const title = ws.getCell("A1");
  title.value = "Charts";
  title.font = { bold: true, size: 18, color: { argb: BRAND } };
  ws.getRow(1).height = 26;
  for (const t of titles) {
    const cell = ws.getCell(t.row, 2);
    cell.value = t.text;
    cell.font = { bold: true, size: 13, color: { argb: INK } };
  }
}

// ----------------------------------------------------------------------------
// Transactions - the full ledger
// ----------------------------------------------------------------------------
function buildTransactions(wb: ExcelJS.Workbook, data: ExportData) {
  const cols: ColDef[] = [
    { header: "Date", key: "date", width: 13, numFmt: DATEFMT },
    { header: "Description", key: "desc", width: 32 },
    { header: "Account", key: "account", width: 18 },
    { header: "Category", key: "category", width: 16 },
    { header: "Type", key: "type", width: 9 },
    { header: "Amount", key: "amount", width: 13, numFmt: MONEY },
    { header: "Your share", key: "share", width: 13, numFmt: MONEY },
    { header: "Signed", key: "net", width: 13, numFmt: MONEY },
    { header: "Whose", key: "whose", width: 11 },
    { header: "Split", key: "split", width: 7, numFmt: INT, align: "center" },
    { header: "Transfer", key: "transfer", width: 9, align: "center" },
    { header: "Budget group", key: "group", width: 13 },
    { header: "Reimbursable", key: "reimbursable", width: 13, align: "center" },
    { header: "Reimbursed", key: "reimbursed", width: 12, align: "center" },
    { header: "Reimbursed amt", key: "reimbursedAmt", width: 14, numFmt: MONEY },
    { header: "Outstanding", key: "outstanding", width: 13, numFmt: MONEY },
    { header: "Inflow type", key: "inflow", width: 14 },
    { header: "Notes", key: "notes", width: 30 },
  ];
  const ws = dataSheet(wb, "Transactions", "FF6366F1", cols);

  const acctById = new Map(data.accounts.map((a) => [a.id, a.name]));
  const catById = new Map(data.categories.map((c) => [c.id, c.name]));
  const inflowById = new Map(data.inflowTypes.map((i) => [i.id, i.name]));

  // Newest first, matching the on-screen ledger order.
  const txns = [...data.transactions].sort((a, b) => (a.txn_date < b.txn_date ? 1 : a.txn_date > b.txn_date ? -1 : 0));
  for (const t of txns) {
    const share = myAmount(t);
    const outstanding = t.reimbursable && !t.is_transfer && t.direction === "outflow"
      ? r2(r2(t.amount - share) - (t.reimbursed_amount ?? 0))
      : null;
    ws.addRow({
      date: xlDate(t.txn_date),
      desc: t.description,
      account: acctById.get(t.account_id) ?? "",
      category: t.category_id ? catById.get(t.category_id) ?? "" : "",
      type: t.direction === "inflow" ? "Inflow" : "Outflow",
      amount: t.amount,
      share,
      net: signed(t),
      whose: t.whose_expense ?? "",
      split: t.split_count ?? null,
      transfer: yn(t.is_transfer),
      group: t.budget_group ?? "",
      reimbursable: yn(t.reimbursable),
      reimbursed: yn(t.reimbursed),
      reimbursedAmt: t.reimbursed_amount || null,
      outstanding: outstanding && outstanding > 0.005 ? outstanding : null,
      inflow: t.inflow_type_id ? inflowById.get(t.inflow_type_id) ?? "" : "",
      notes: t.notes ?? "",
    });
  }
  const last = ws.rowCount;
  zebra(ws, 2, last, cols.length);
  colorBySign(ws, "net", 2, last);
  autofilter(ws, cols.length, last);
  totalsRow(ws, "desc", ["amount", "share"], 2, last);
}

// ----------------------------------------------------------------------------
// Monthly Summary - balance chain + earned cash flow per month
// ----------------------------------------------------------------------------
function buildMonthlySummary(wb: ExcelJS.Workbook, data: ExportData, netWorth: number) {
  const cols: ColDef[] = [
    { header: "Month", key: "month", width: 14 },
    { header: "Opening balance", key: "opening", width: 15, numFmt: MONEY },
    { header: "Income (earned)", key: "income", width: 15, numFmt: MONEY },
    { header: "Expenses", key: "expenses", width: 14, numFmt: MONEY },
    { header: "Investments", key: "investments", width: 14, numFmt: MONEY },
    { header: "Net cash flow", key: "net", width: 14, numFmt: MONEY },
    { header: "Closing balance", key: "closing", width: 15, numFmt: MONEY },
  ];
  const ws = dataSheet(wb, "Monthly Summary", "FF8B5CF6", cols);

  const nwIds = new Set(data.accounts.filter((a) => a.include_in_net_worth).map((a) => a.id));
  const balances = monthlyBalances(data.transactions, nwIds, netWorth);
  const flowByMonth = new Map(monthlyCashFlow(data.transactions).map((m) => [m.month, m]));

  const months = [...new Set([...balances.keys(), ...flowByMonth.keys()])].sort();
  for (const m of months) {
    const bal = balances.get(m);
    const flow = flowByMonth.get(m);
    ws.addRow({
      month: monthLabel(m),
      opening: bal?.opening ?? null,
      income: flow?.income ?? null,
      expenses: flow?.expenses ?? null,
      investments: flow?.investments ?? null,
      net: flow?.net ?? null,
      closing: bal?.closing ?? null,
    });
  }
  const last = ws.rowCount;
  zebra(ws, 2, last, cols.length);
  colorBySign(ws, "net", 2, last);
  autofilter(ws, cols.length, last);
  totalsRow(ws, "month", ["income", "expenses", "investments", "net"], 2, last);
}

// ----------------------------------------------------------------------------
// Categories - net spend per category
// ----------------------------------------------------------------------------
function buildCategories(wb: ExcelJS.Workbook, data: ExportData) {
  const cols: ColDef[] = [
    { header: "Category", key: "name", width: 26 },
    { header: "Net spent", key: "total", width: 15, numFmt: MONEY },
    { header: "Transactions", key: "count", width: 13, numFmt: INT, align: "center" },
  ];
  const ws = dataSheet(wb, "Categories", "FFA855F7", cols);
  for (const c of categoryTotals(data.transactions, data.categories)) {
    ws.addRow({ name: c.name, total: c.total, count: c.count });
  }
  const last = ws.rowCount;
  zebra(ws, 2, last, cols.length);
  autofilter(ws, cols.length, last);
  totalsRow(ws, "name", ["total", "count"], 2, last);
}

// ----------------------------------------------------------------------------
// Insights - 50/30/20 split per month
// ----------------------------------------------------------------------------
function buildInsights(wb: ExcelJS.Workbook, data: ExportData) {
  const cols: ColDef[] = [
    { header: "Month", key: "month", width: 14 },
    { header: "Needs", key: "needs", width: 13, numFmt: MONEY },
    { header: "Wants", key: "wants", width: 13, numFmt: MONEY },
    { header: "Savings", key: "savings", width: 13, numFmt: MONEY },
    { header: "Unclassified", key: "unclassified", width: 13, numFmt: MONEY },
    { header: "Total out", key: "total", width: 13, numFmt: MONEY },
    { header: "Income", key: "income", width: 13, numFmt: MONEY },
    { header: "Needs %", key: "needsPct", width: 10, numFmt: PCT },
    { header: "Wants %", key: "wantsPct", width: 10, numFmt: PCT },
    { header: "Savings %", key: "savingsPct", width: 10, numFmt: PCT },
  ];
  const ws = dataSheet(wb, "Insights (50-30-20)", "FF0EA5E9", cols);

  const income = incomeByMonth(data.transactions);
  for (const g of budgetGroupsByMonth(data.transactions)) {
    const denom = g.total > 0 ? g.total : 0;
    ws.addRow({
      month: g.label,
      needs: g.needs,
      wants: g.wants,
      savings: g.savings,
      unclassified: g.unclassified,
      total: g.total,
      income: income.get(g.month) ?? 0,
      needsPct: denom ? g.needs / denom : 0,
      wantsPct: denom ? g.wants / denom : 0,
      savingsPct: denom ? g.savings / denom : 0,
    });
  }
  const last = ws.rowCount;
  zebra(ws, 2, last, cols.length);
  autofilter(ws, cols.length, last);
  totalsRow(ws, "month", ["needs", "wants", "savings", "unclassified", "total", "income"], 2, last);
}

// ----------------------------------------------------------------------------
// Budget - learned per-category budget vs spend, every month
// ----------------------------------------------------------------------------
function buildBudget(wb: ExcelJS.Workbook, data: ExportData) {
  const cols: ColDef[] = [
    { header: "Month", key: "month", width: 14 },
    { header: "Category", key: "category", width: 22 },
    { header: "Budget", key: "budget", width: 13, numFmt: MONEY },
    { header: "Spent", key: "spent", width: 13, numFmt: MONEY },
    { header: "Remaining", key: "remaining", width: 13, numFmt: MONEY },
    { header: "% used", key: "pct", width: 10, numFmt: PCT },
    { header: "Source", key: "source", width: 10 },
    { header: "Trend", key: "trend", width: 9 },
  ];
  const ws = dataSheet(wb, "Budget", "FF06B6D4", cols);

  const settings = data.settings;
  const runwayFloor = settings ? monthlyBudget(settings) : 0;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months = [...new Set([...data.transactions.map((t) => monthKey(t.txn_date)), currentMonth])].sort();

  for (const m of months) {
    const status = monthlyBudgetStatus(
      data.transactions,
      data.categories,
      m,
      m === currentMonth ? now.getDate() : undefined,
      runwayFloor,
    );
    for (const c of status.categories) {
      ws.addRow({
        month: status.label,
        category: c.name,
        budget: c.budget,
        spent: c.spent,
        remaining: c.remaining,
        pct: c.pct,
        source: c.isAuto ? "Auto" : "Pinned",
        trend: c.trend,
      });
    }
  }
  const last = ws.rowCount;
  zebra(ws, 2, last, cols.length);
  colorBySign(ws, "remaining", 2, last);
  autofilter(ws, cols.length, last);
}

// ----------------------------------------------------------------------------
// Accounts - balances & activity
// ----------------------------------------------------------------------------
function buildAccounts(wb: ExcelJS.Workbook, data: ExportData) {
  const cols: ColDef[] = [
    { header: "Account", key: "name", width: 22 },
    { header: "Bank", key: "bank", width: 18 },
    { header: "Type", key: "type", width: 13 },
    { header: "Opening balance", key: "opening", width: 15, numFmt: MONEY },
    { header: "Inflow", key: "inflow", width: 13, numFmt: MONEY },
    { header: "Outflow", key: "outflow", width: 13, numFmt: MONEY },
    { header: "Net", key: "net", width: 13, numFmt: MONEY },
    { header: "Balance", key: "balance", width: 14, numFmt: MONEY },
    { header: "In net worth", key: "inNw", width: 12, align: "center" },
    { header: "Credit", key: "credit", width: 9, align: "center" },
  ];
  const ws = dataSheet(wb, "Accounts", "FF10B981", cols);

  for (const a of accountActivity(data.transactions, data.accounts, data.categories)) {
    ws.addRow({
      name: a.account.name,
      bank: a.account.bank,
      type: TYPE_LABELS[a.account.type] ?? a.account.type,
      opening: a.account.opening_balance,
      inflow: a.inflow,
      outflow: a.outflow,
      net: a.net,
      balance: a.balance,
      inNw: a.account.include_in_net_worth ? "Yes" : "",
      credit: yn(a.account.is_credit),
    });
  }
  const last = ws.rowCount;
  zebra(ws, 2, last, cols.length);
  colorBySign(ws, "net", 2, last);
  autofilter(ws, cols.length, last);
  totalsRow(ws, "name", ["inflow", "outflow", "net", "balance"], 2, last);
}

// ----------------------------------------------------------------------------
// India Transfers - ledger + FX summary block
// ----------------------------------------------------------------------------
function buildIndia(wb: ExcelJS.Workbook, data: ExportData) {
  const cols: ColDef[] = [
    { header: "Date", key: "date", width: 13, numFmt: DATEFMT },
    { header: "Direction", key: "direction", width: 11 },
    { header: "Description", key: "desc", width: 28 },
    { header: "Endpoint", key: "endpoint", width: 16 },
    { header: "USD", key: "usd", width: 14, numFmt: MONEY },
    { header: "INR", key: "inr", width: 16, numFmt: INRFMT },
    { header: "Rate (₹/$)", key: "rate", width: 12, numFmt: RATE },
    { header: "Notes", key: "notes", width: 28 },
  ];
  const ws = dataSheet(wb, "India Transfers", "FFF59E0B", cols);

  const sorted = [...data.indiaTransfers].sort((a, b) => (a.transfer_date < b.transfer_date ? -1 : 1));
  for (const t of sorted) {
    const rate = t.effective_fx_rate ?? (t.usd_amount ? t.inr_amount / t.usd_amount : null);
    ws.addRow({
      date: xlDate(t.transfer_date),
      direction: t.direction === "received" ? "Received" : "Sent",
      desc: t.description,
      endpoint: t.endpoint ?? "",
      usd: t.usd_amount,
      inr: t.inr_amount,
      rate,
      notes: t.notes ?? "",
    });
  }
  const last = ws.rowCount;
  zebra(ws, 2, last, cols.length);
  autofilter(ws, cols.length, last);

  // FX summary, two rows below the ledger.
  const fx = fxSummary(data.indiaTransfers);
  let row = last + 2;
  const put = (label: string, value: number | null, fmt: string) => {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true };
    const v = ws.getCell(row, 5);
    v.value = value;
    v.numFmt = fmt;
    row++;
  };
  ws.getCell(row, 1).value = "FX summary";
  ws.getCell(row, 1).font = { bold: true, size: 12, color: { argb: "FFF59E0B" } };
  row++;
  put("Total received (USD)", fx.totalReceivedUsd, MONEY);
  put("Total received (INR)", fx.totalReceivedInr, INRFMT);
  put("Total sent (USD)", fx.totalSentUsd, MONEY);
  put("Total sent (INR)", fx.totalSentInr, INRFMT);
  put("Net USD", r2(fx.totalReceivedUsd - fx.totalSentUsd), MONEY);
  put("Avg received rate (₹/$)", fx.avgReceivedRate, RATE);
  put("Avg sent rate (₹/$)", fx.avgSentRate, RATE);
}

// ----------------------------------------------------------------------------
// Debtors - who owes you
// ----------------------------------------------------------------------------
function buildDebtors(wb: ExcelJS.Workbook, data: ExportData) {
  const cols: ColDef[] = [
    { header: "Name", key: "name", width: 24 },
    { header: "Note", key: "note", width: 40 },
    { header: "Owes", key: "amount", width: 14, numFmt: MONEY },
  ];
  const ws = dataSheet(wb, "Debtors", "FFEF4444", cols);
  const sorted = [...data.debtors].sort((a, b) => b.amount - a.amount);
  for (const d of sorted) {
    ws.addRow({ name: d.name, note: d.note ?? "", amount: d.amount });
  }
  const last = ws.rowCount;
  zebra(ws, 2, last, cols.length);
  autofilter(ws, cols.length, last);
  totalsRow(ws, "name", ["amount"], 2, last);
}

// ----------------------------------------------------------------------------
// Reference - settings + lookup lists
// ----------------------------------------------------------------------------
function buildReference(wb: ExcelJS.Workbook, data: ExportData) {
  const ws = wb.addWorksheet("Reference", { properties: { tabColor: { argb: SLATE } } });
  [30, 18, 16, 18, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  let row = 1;
  const heading = (label: string) => {
    const a = ws.getCell(row, 1);
    a.value = label;
    a.font = { bold: true, size: 13, color: { argb: INK } };
    row++;
  };
  const tableHeader = (labels: string[]) => {
    labels.forEach((l, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = l;
      cell.font = { bold: true, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE } };
    });
    row++;
  };

  // Settings
  heading("Settings");
  const s = data.settings;
  const put = (label: string, value: string | number, fmt?: string) => {
    ws.getCell(row, 1).value = label;
    const v = ws.getCell(row, 2);
    v.value = value;
    if (fmt) v.numFmt = fmt;
    row++;
  };
  put("Currency", s?.currency ?? "USD");
  put("Starting funds", s?.starting_funds ?? 0, MONEY);
  put("Budget months", s?.budget_months ?? 0, INT);
  put("Savings target", s?.savings_target ?? 0, MONEY);
  put("Monthly budget (derived)", s ? monthlyBudget(s) : 0, MONEY);
  row += 1;

  // Categories
  heading("Categories");
  tableHeader(["Name", "Budget group", "Monthly budget", "Linked account", "No budget"]);
  const acctById = new Map(data.accounts.map((a) => [a.id, a.name]));
  const catStart = row;
  for (const c of [...data.categories].sort((a, b) => a.display_order - b.display_order)) {
    ws.getCell(row, 1).value = c.name;
    ws.getCell(row, 2).value = c.budget_group ?? "";
    const mb = ws.getCell(row, 3);
    mb.value = c.monthly_budget ?? null;
    mb.numFmt = MONEY;
    ws.getCell(row, 4).value = c.linked_account_id ? acctById.get(c.linked_account_id) ?? "" : "";
    ws.getCell(row, 5).value = yn(c.no_budget);
    row++;
  }
  zebra(ws, catStart, row - 1, 5);
  row += 1;

  // Income types
  heading("Income types");
  tableHeader(["Name", "Paycheck"]);
  for (const i of [...data.inflowTypes].sort((a, b) => a.display_order - b.display_order)) {
    ws.getCell(row, 1).value = i.name;
    ws.getCell(row, 2).value = yn(i.is_paycheck);
    row++;
  }
  row += 1;

  // Other income (schema table, not surfaced on any page)
  if (data.otherIncome.length) {
    heading("Other income");
    tableHeader(["Label", "Amount", "Received"]);
    for (const o of data.otherIncome) {
      ws.getCell(row, 1).value = o.label;
      const amt = ws.getCell(row, 2);
      amt.value = o.amount;
      amt.numFmt = MONEY;
      ws.getCell(row, 3).value = o.received_date ? fmtDate(o.received_date) : "";
      row++;
    }
  }
}

/**
 * Build the full workbook - one tab per page - and return it as a Buffer.
 * All figures route through calc.ts, so they match the live app to the cent.
 */
export async function buildWorkbook(data: ExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Finance Tracker";
  wb.created = new Date();
  wb.title = "Finance Tracker export";

  const acct = accountActivity(data.transactions, data.accounts, data.categories);
  const netWorth = r2(
    acct.filter((a) => a.account.include_in_net_worth).reduce((s, a) => s + a.balance, 0),
  );

  const charts = prepareCharts(data, netWorth);

  buildOverview(wb, data, netWorth);
  addChartsTitles(wb, charts.titles);
  buildTransactions(wb, data);
  buildMonthlySummary(wb, data, netWorth);
  buildCategories(wb, data);
  buildInsights(wb, data);
  buildBudget(wb, data);
  buildAccounts(wb, data);
  buildIndia(wb, data);
  buildDebtors(wb, data);
  buildReference(wb, data);

  // Hidden sheet holding the series the native charts reference.
  const chartData = wb.addWorksheet("Chart data");
  chartData.state = "hidden";
  charts.fill(chartData);

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return injectCharts(buf, "Charts", charts.specs);
}
