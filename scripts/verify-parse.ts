// Quick sanity check: parse the source workbook and print counts + samples.
// Run: npx tsx scripts/verify-parse.ts
import { readFileSync } from "node:fs";
import { parseWorkbook } from "../src/lib/import-parse";

const buf = readFileSync(
  new URL("../data/Final_Dynamic_Finance_Tracker.xlsx", import.meta.url),
);
const p = parseWorkbook(buf);

console.log("startingFunds:", p.startingFunds);
console.log("transactions:", p.transactions.length);
console.log("  inflow:", p.transactions.filter((t) => t.direction === "inflow").length);
console.log("  outflow:", p.transactions.filter((t) => t.direction === "outflow").length);
console.log("indiaTransfers:", p.indiaTransfers.length);
console.log("otherIncome:", p.otherIncome);
console.log("warnings:", p.warnings);

const dates = p.transactions.map((t) => t.txn_date).sort();
console.log("date range:", dates[0], "->", dates[dates.length - 1]);
console.log("\nfirst 3 txns:", p.transactions.slice(0, 3));
console.log("\nsample inflow:", p.transactions.find((t) => t.direction === "inflow"));
console.log("\nsample india:", p.indiaTransfers[0]);

const totalOut = p.transactions.filter((t) => t.direction === "outflow").reduce((s, t) => s + t.amount, 0);
const totalIn = p.transactions.filter((t) => t.direction === "inflow").reduce((s, t) => s + t.amount, 0);
console.log("\ntotal outflow:", totalOut.toFixed(2), "total inflow:", totalIn.toFixed(2));

// Distinct enum values seen
const cats = new Set(p.transactions.map((t) => t.categoryName).filter(Boolean));
const accs = new Set(p.transactions.map((t) => t.accountName).filter(Boolean));
const inflowTypes = new Set(p.transactions.map((t) => t.inflowTypeName).filter(Boolean));
const whose = new Set(p.transactions.map((t) => t.whoseExpense).filter(Boolean));
console.log("\ndistinct categories:", [...cats]);
console.log("distinct accounts:", [...accs]);
console.log("distinct inflowTypes:", [...inflowTypes]);
console.log("distinct whose:", [...whose]);
