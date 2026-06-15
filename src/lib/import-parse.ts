// Pure parser for the source workbook (Final_Dynamic_Finance_Tracker.xlsx).
// No 'use server'/'use client' pragma so it can be imported by the in-app
// import action, a client-side preview, and the dev seed script alike.
//
// Returns name-keyed rows (category/account/inflow-type names, not ids). The
// caller resolves names -> ids against the user's seeded lookup tables.

import * as XLSX from "xlsx";

export interface ParsedTransaction {
  txn_date: string;
  categoryName: string | null;
  description: string;
  accountName: string | null;
  direction: "outflow" | "inflow";
  amount: number;
  inflowTypeName: string | null;
  whoseExpense: "My" | "Friend" | "Group" | "Roommates" | null;
}

export interface ParsedIndiaTransfer {
  transfer_date: string;
  direction: "received" | "sent";
  description: string;
  endpoint: string | null;
  usd_amount: number;
  inr_amount: number;
  notes: string | null;
}

export interface ParsedOtherIncome {
  label: string;
  amount: number;
}

export interface ParsedWorkbook {
  startingFunds: number | null;
  transactions: ParsedTransaction[];
  indiaTransfers: ParsedIndiaTransfer[];
  otherIncome: ParsedOtherIncome[];
  warnings: string[];
}

// --- cell coercion helpers -------------------------------------------------

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30); // serial 0

/** Excel serial / Date / ISO-string -> 'YYYY-MM-DD' (UTC, no TZ drift). */
function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const ms = EXCEL_EPOCH_UTC + Math.round(v) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    return new Date(
      Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()),
    )
      .toISOString()
      .slice(0, 10);
  }
  const s = String(v).trim();
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function isDateCell(v: unknown): boolean {
  return v instanceof Date || typeof v === "number";
}

const WHOSE = new Set(["My", "Friend", "Group", "Roommates"]);

type Grid = unknown[][];

function sheetGrid(wb: XLSX.WorkBook, name: string): Grid | null {
  const ws = wb.Sheets[name];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });
}

// --- main parser -----------------------------------------------------------

export function parseWorkbook(input: ArrayBuffer | Uint8Array | Buffer): ParsedWorkbook {
  // cellDates:false -> dates arrive as Excel serial numbers, converted in
  // toISODate above. This sidesteps SheetJS's timezone handling entirely.
  const wb = XLSX.read(input, { type: "array", cellDates: false });
  const warnings: string[] = [];

  // ---------------- Expense Tracker -> transactions ----------------
  const transactions: ParsedTransaction[] = [];
  const et = sheetGrid(wb, "Expense Tracker");
  if (!et) {
    warnings.push('Sheet "Expense Tracker" not found.');
  } else {
    for (const row of et) {
      // A data row is one whose first cell (col A) is a date.
      if (!row || !isDateCell(row[0])) continue;
      const txn_date = toISODate(row[0]);
      if (!txn_date) continue;
      const outflow = toNum(row[4]); // E
      const inflow = toNum(row[5]); // F
      const description = toStr(row[2]) ?? "(no description)"; // C

      // A row may carry BOTH an outflow and an inflow (e.g. a purchase that was
      // partly settled the same line). Emit a transaction for each — not else-if.
      if (outflow != null && outflow !== 0) {
        const whose = toStr(row[7]); // H
        transactions.push({
          txn_date,
          categoryName: toStr(row[1]), // B
          description,
          accountName: toStr(row[3]), // D
          direction: "outflow",
          amount: Math.abs(outflow),
          inflowTypeName: null,
          whoseExpense: whose && WHOSE.has(whose) ? (whose as ParsedTransaction["whoseExpense"]) : "My",
        });
      }
      if (inflow != null && inflow !== 0) {
        transactions.push({
          txn_date,
          categoryName: toStr(row[1]),
          description,
          accountName: toStr(row[3]),
          direction: "inflow",
          amount: Math.abs(inflow),
          inflowTypeName: normalizeInflowType(toStr(row[6])), // G
          whoseExpense: null,
        });
      }
    }
  }

  // ---------------- India Transfers ----------------
  const indiaTransfers: ParsedIndiaTransfer[] = [];
  const it = sheetGrid(wb, "India Transfers");
  if (it) {
    for (const row of it) {
      if (!row || !isDateCell(row[0])) continue;
      const transfer_date = toISODate(row[0]);
      if (!transfer_date) continue;
      const typeText = (toStr(row[1]) ?? "").toLowerCase(); // B
      const direction: "received" | "sent" = typeText.includes("sent") ? "sent" : "received";
      const outUsd = toNum(row[4]); // E Outflow USD
      const inUsd = toNum(row[5]); // F Inflow USD
      const inr = toNum(row[6]); // G Amount INR
      const usd = direction === "sent" ? outUsd : inUsd;
      if (usd == null || inr == null) continue;
      indiaTransfers.push({
        transfer_date,
        direction,
        description: toStr(row[2]) ?? "(transfer)", // C
        endpoint: toStr(row[3]), // D
        usd_amount: Math.abs(usd),
        inr_amount: Math.abs(inr),
        notes: toStr(row[8]), // I
      });
    }
  }

  // ---------------- Summary & Balances -> starting funds + other income ----
  let startingFunds: number | null = null;
  const otherIncome: ParsedOtherIncome[] = [];
  const sb = sheetGrid(wb, "Summary & Balances");
  if (sb) {
    let inOtherIncome = false;
    for (const row of sb) {
      if (!row) continue;
      const aText = toStr(row[0]); // col A
      if (aText && /total funds available/i.test(aText)) {
        startingFunds = toNum(row[1]); // col B
      }
      // "Other Sources of Income" table (A17:B23): exact header, then
      // label/amount rows. Anchored so the "Total of Other Sources of
      // Income:" summary line above it does not trigger capture.
      if (aText && /^other sources of income$/i.test(aText)) {
        inOtherIncome = true;
        continue;
      }
      if (inOtherIncome) {
        const label = aText;
        const amount = toNum(row[1]);
        // Stop at a blank row or another section; skip summary/header rows.
        if (!label) {
          inOtherIncome = false;
        } else if (amount != null && !/^amount$/i.test(label) && !label.endsWith(":")) {
          otherIncome.push({ label, amount });
        }
      }
    }
  }

  return { startingFunds, transactions, indiaTransfers, otherIncome, warnings };
}

/** Map the workbook's inflow-type spellings onto the app's canonical names. */
function normalizeInflowType(name: string | null): string | null {
  if (!name) return null;
  if (/^reimburse?ment$/i.test(name) || /reimbursment/i.test(name)) return "Reimbursement";
  return name;
}
