// Analysis-only: compute the full money decomposition and test which identity
// reconciles to net worth. Run: SEED_EMAIL=... npx tsx scripts/reconcile.ts

import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
try {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ARRIVAL = /wire transfer from home|forex card to bofa|initial cash deposit/i;
const f = (n: number) => n.toFixed(2).padStart(12);

function myShare(t: { direction: string; amount: number; is_transfer: boolean; whose_expense: string | null; split_count: number | null }) {
  if (t.direction !== "outflow" || t.is_transfer) return 0;
  if (t.whose_expense === "Friend") return 0;
  if (t.whose_expense === "Group" || t.whose_expense === "Roommates") {
    return t.split_count && t.split_count > 0 ? round2(t.amount / t.split_count) : 0;
  }
  return t.amount;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });
  const email = process.env.SEED_EMAIL;
  const { data: list } = await supabase.auth.admin.listUsers();
  const user = list.users.find((u) => u.email?.toLowerCase() === email?.toLowerCase());
  if (!user) throw new Error(`No user for ${email}`);

  const [{ data: settings }, { data: txns }, { data: accounts }, { data: india }] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", user.id).single(),
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("accounts").select("*").eq("user_id", user.id),
    supabase.from("india_transfers").select("*").eq("user_id", user.id),
  ]);
  const T = txns ?? [];

  // Account balances
  const delta = new Map<string, number>();
  for (const t of T) delta.set(t.account_id, (delta.get(t.account_id) ?? 0) + (t.direction === "inflow" ? t.amount : -t.amount));
  console.log("\n=== ACCOUNTS ===");
  let netWorth = 0, allBal = 0;
  for (const a of accounts ?? []) {
    const bal = round2(a.opening_balance + (delta.get(a.id) ?? 0));
    allBal += bal;
    if (a.include_in_net_worth) netWorth += bal;
    console.log(`${a.name.padEnd(20)} open=${f(a.opening_balance)} bal=${f(bal)} NW=${a.include_in_net_worth}`);
  }
  netWorth = round2(netWorth); allBal = round2(allBal);

  // Inflows
  const inAll = round2(T.filter((t) => t.direction === "inflow" && !t.is_transfer).reduce((s, t) => s + t.amount, 0));
  const inArrival = round2(T.filter((t) => t.direction === "inflow" && !t.is_transfer && ARRIVAL.test(t.description)).reduce((s, t) => s + t.amount, 0));
  const inCounted = round2(inAll - inArrival);
  const inTransfer = round2(T.filter((t) => t.direction === "inflow" && t.is_transfer).reduce((s, t) => s + t.amount, 0));

  // Outflows
  const outAllFull = round2(T.filter((t) => t.direction === "outflow" && !t.is_transfer).reduce((s, t) => s + t.amount, 0));
  const savingsFull = round2(T.filter((t) => t.direction === "outflow" && !t.is_transfer && t.budget_group === "savings").reduce((s, t) => s + t.amount, 0));
  const savingsShare = round2(T.filter((t) => t.budget_group === "savings").reduce((s, t) => s + myShare(t), 0));
  const spentShare = round2(T.filter((t) => t.budget_group !== "savings").reduce((s, t) => s + myShare(t), 0));
  const spentFullNonSav = round2(T.filter((t) => t.direction === "outflow" && !t.is_transfer && t.budget_group !== "savings").reduce((s, t) => s + t.amount, 0));
  const frontGap = round2(spentFullNonSav - spentShare);
  const outTransfer = round2(T.filter((t) => t.direction === "outflow" && t.is_transfer).reduce((s, t) => s + t.amount, 0));

  console.log("\n=== FLOWS ===");
  console.log("starting_funds      ", f(settings?.starting_funds ?? 0));
  console.log("inflow (non-xfer)   ", f(inAll), " = arrival", f(inArrival), "+ counted", f(inCounted));
  console.log("inflow (transfer)   ", f(inTransfer));
  console.log("outflow full (all)  ", f(outAllFull));
  console.log("  savings full      ", f(savingsFull), " share", f(savingsShare));
  console.log("  spent full nonsav ", f(spentFullNonSav), " share", f(spentShare), " frontGap", f(frontGap));
  console.log("outflow (transfer)  ", f(outTransfer));

  console.log("\n=== BALANCES ===");
  console.log("net worth           ", f(netWorth));
  console.log("all accounts        ", f(allBal));

  const S = settings?.starting_funds ?? 0;
  console.log("\n=== IDENTITY CHECKS (want residual ~ 0 vs net worth", f(netWorth), ") ===");
  const checks: [string, number][] = [
    ["inAll - spentShare - savShare", round2(inAll - spentShare - savingsShare)],
    ["S + inCounted - spentShare - savShare", round2(S + inCounted - spentShare - savingsShare)],
    ["inAll - spentFull - savFull (full amounts)", round2(inAll - spentFullNonSav - savingsFull)],
    ["S + inCounted - spentFull - savFull", round2(S + inCounted - spentFullNonSav - savingsFull)],
  ];
  for (const [label, v] of checks) console.log(`${label.padEnd(45)} = ${f(v)}  residual=${f(round2(v - netWorth))}`);

  console.log("\n=== INDIA TRANSFERS (separate sheet) ===");
  const iRecv = round2((india ?? []).filter((t) => t.direction === "received").reduce((s, t) => s + t.usd_amount, 0));
  const iSent = round2((india ?? []).filter((t) => t.direction === "sent").reduce((s, t) => s + t.usd_amount, 0));
  console.log("received USD", f(iRecv), " sent USD", f(iSent), " count", (india ?? []).length);

  console.log("\n=== budget_group coverage ===");
  const byGroup = new Map<string, number>();
  for (const t of T.filter((t) => t.direction === "outflow" && !t.is_transfer)) {
    const g = t.budget_group ?? "(null)";
    byGroup.set(g, (byGroup.get(g) ?? 0) + 1);
  }
  for (const [g, c] of byGroup) console.log(`  ${g.padEnd(14)} ${c} txns`);
}

main().catch((e) => { console.error(e); process.exit(1); });
