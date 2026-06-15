// Heuristic detector for internal transfers, flagged (is_transfer=true) for
// your review. Two signals:
//   A) Matched pair: an outflow on one account + an inflow on another with the
//      SAME amount within a few days (the inflow isn't clearly external income).
//   B) Keyword: description mentions "transfer" AND one of your accounts.
// Review the result in the app: Transactions → filter "Transfers" → unmark any
// false positives. Re-running is safe (won't double-flag).
//
// Run: SEED_EMAIL=you@example.com npx tsx scripts/detect-transfers.ts

import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
try {
  for (const raw of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith("#")) continue;
    const e = l.indexOf("=");
    if (e === -1) continue;
    const k = l.slice(0, e).trim();
    let v = l.slice(e + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
} catch {}

const WINDOW_DAYS = 7;
// Inflow types that are clearly EXTERNAL income, never an internal-transfer leg.
const EXTERNAL_INFLOW = /paycheck|reimburse|cashback|refund/i;

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const dryRun = process.argv.includes("--dry-run");
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });

  const { data: list } = await supabase.auth.admin.listUsers();
  const user = list.users.find((u) => u.email?.toLowerCase() === process.env.SEED_EMAIL?.toLowerCase());
  if (!user) throw new Error(`No user for ${process.env.SEED_EMAIL}`);

  const [{ data: txns }, { data: accounts }, { data: inflowTypes }] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id).order("txn_date"),
    supabase.from("accounts").select("id, name").eq("user_id", user.id),
    supabase.from("inflow_types").select("id, name").eq("user_id", user.id),
  ]);

  const acctName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const externalInflowIds = new Set(
    (inflowTypes ?? []).filter((i) => EXTERNAL_INFLOW.test(i.name)).map((i) => i.id),
  );
  // Account-name word tokens for the keyword rule.
  const tokens = new Set<string>(["bofa", "chase", "checking", "savings"]);
  for (const a of accounts ?? []) for (const w of a.name.toLowerCase().split(/\s+/)) if (w.length > 2) tokens.add(w);

  const all = txns ?? [];
  const flagged = new Map<string, string>(); // id -> reason
  const reason = (t: (typeof all)[number]) => `${t.txn_date}  ${t.direction === "inflow" ? "+" : "-"}$${t.amount}  ${acctName.get(t.account_id)}  "${t.description}"`;

  // --- Rule A: matched outflow/inflow pairs ---
  // A genuine inter-account transfer is NOT a reimbursement (someone paying you
  // back) — exclude those by type or description so split repayments that happen
  // to match an amount aren't misread as transfers.
  const isReimbursement = (t: (typeof all)[number]) =>
    (t.inflow_type_id && externalInflowIds.has(t.inflow_type_id)) || /reimburs/i.test(t.description);
  const outflows = all.filter((t) => t.direction === "outflow" && !t.is_transfer && !/reimburs/i.test(t.description));
  const inflows = all.filter((t) => t.direction === "inflow" && !t.is_transfer && !isReimbursement(t));
  const usedInflow = new Set<string>();
  let pairCount = 0;
  for (const out of outflows) {
    if (flagged.has(out.id)) continue;
    let best: (typeof all)[number] | null = null;
    let bestGap = Infinity;
    for (const inf of inflows) {
      if (usedInflow.has(inf.id)) continue;
      if (inf.amount !== out.amount) continue;
      if (inf.account_id === out.account_id) continue;
      const gap = daysBetween(out.txn_date, inf.txn_date);
      if (gap <= WINDOW_DAYS && gap < bestGap) {
        best = inf;
        bestGap = gap;
      }
    }
    if (best) {
      usedInflow.add(best.id);
      flagged.set(out.id, `pair (Δ${bestGap}d)`);
      flagged.set(best.id, `pair (Δ${bestGap}d)`);
      pairCount++;
    }
  }

  // --- Rule B: "transfer" keyword + account reference ---
  let kwCount = 0;
  for (const t of all) {
    if (t.is_transfer || flagged.has(t.id)) continue;
    const d = t.description.toLowerCase();
    if (/transfer/.test(d) && [...tokens].some((tok) => d.includes(tok))) {
      flagged.set(t.id, "keyword");
      kwCount++;
    }
  }

  // --- Report ---
  console.log(`\nMatched pairs: ${pairCount} (= ${pairCount * 2} transactions)`);
  console.log(`Keyword matches: ${kwCount}`);
  console.log(`Total flagged: ${flagged.size}\n`);
  const byId = new Map(all.map((t) => [t.id, t]));
  for (const [id, why] of [...flagged.entries()].sort((a, b) => byId.get(a[0])!.txn_date.localeCompare(byId.get(b[0])!.txn_date))) {
    console.log(`  [${why}] ${reason(byId.get(id)!)}`);
  }

  if (dryRun) {
    console.log("\n(dry run — nothing changed)");
    return;
  }
  const ids = [...flagged.keys()];
  if (ids.length) {
    const { error } = await supabase
      .from("transactions")
      .update({ is_transfer: true, category_id: null, inflow_type_id: null, whose_expense: null, debtor_id: null })
      .in("id", ids)
      .eq("user_id", user.id);
    if (error) throw error;
  }
  console.log(`\nFlagged ${ids.length} transactions as transfers. Review in Transactions → Transfers filter.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
