// Flags UNCATEGORIZED transactions that aren't real income/expense so they drop
// out of income/spending (kept in account balances). Excluded:
//   - non-paycheck inflows (reimbursements, refunds, cashback, deposits, untyped)
//   - outflows fronted for others (whose_expense = Friend/Group/Roommates)
// Kept: paycheck inflows (income) and your own (My) expenses.
// Metadata (inflow type / whose) is preserved so you can still see what each was.
//
// Run: SEED_EMAIL=you@example.com npx tsx scripts/flag-noncounted.ts [--dry-run]

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

const FRIEND = new Set(["Friend", "Group", "Roommates"]);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: list } = await supabase.auth.admin.listUsers();
  const user = list.users.find((u) => u.email?.toLowerCase() === process.env.SEED_EMAIL?.toLowerCase());
  if (!user) throw new Error(`No user for ${process.env.SEED_EMAIL}`);

  const [{ data: tx }, { data: it }] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("inflow_types").select("id, name").eq("user_id", user.id),
  ]);
  const paycheckIds = new Set((it ?? []).filter((i) => /paycheck/i.test(i.name)).map((i) => i.id));

  const candidates = (tx ?? []).filter((t) => {
    if (t.category_id !== null || t.is_transfer) return false;
    if (t.direction === "inflow") return !(t.inflow_type_id && paycheckIds.has(t.inflow_type_id));
    return t.whose_expense != null && FRIEND.has(t.whose_expense);
  });

  const inflowN = candidates.filter((t) => t.direction === "inflow");
  const outflowN = candidates.filter((t) => t.direction === "outflow");
  const sum = (a: typeof candidates) => a.reduce((s, t) => s + t.amount, 0).toFixed(2);
  console.log(`Flagging ${candidates.length} uncategorized non-income/expense rows:`);
  console.log(`  inflows (reimb/refund/cashback/deposit/untyped): ${inflowN.length}  $${sum(inflowN)}`);
  console.log(`  outflows fronted for others:                     ${outflowN.length}  $${sum(outflowN)}`);

  if (dryRun) {
    console.log("\n(dry run — nothing changed)");
    return;
  }
  const ids = candidates.map((t) => t.id);
  // Preserve inflow_type / whose_expense; only set the exclusion flag.
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await supabase
      .from("transactions")
      .update({ is_transfer: true })
      .in("id", ids.slice(i, i + CHUNK))
      .eq("user_id", user.id);
    if (error) throw error;
  }
  console.log(`\nFlagged ${ids.length} transactions. Review under Transactions → Transfers filter.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
