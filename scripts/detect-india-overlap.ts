// Flags ledger transactions that duplicate an India-transfer (the standalone
// India Transfers sheet) so they don't count as income/expense. Matches by
// EXACT description + direction (received→inflow, sent→outflow) — not loose
// keywords — so Indian groceries/restaurants/fees are left untouched.
// Balances are unaffected (is_transfer rows still count toward account balance).
//
// Run: SEED_EMAIL=you@example.com npx tsx scripts/detect-india-overlap.ts [--dry-run]

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

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

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

  const [{ data: india }, { data: tx }, { data: accts }] = await Promise.all([
    supabase.from("india_transfers").select("*").eq("user_id", user.id),
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("accounts").select("id, name").eq("user_id", user.id),
  ]);
  const acctName = new Map((accts ?? []).map((a) => [a.id, a.name]));

  // index ledger txns by normalized description
  const byDesc = new Map<string, typeof tx>();
  for (const t of tx ?? []) {
    const k = norm(t.description);
    (byDesc.get(k) ?? byDesc.set(k, []).get(k)!).push(t);
  }

  const flag = new Map<string, string>();
  for (const it of india ?? []) {
    const wantDir = it.direction === "received" ? "inflow" : "outflow";
    for (const t of byDesc.get(norm(it.description)) ?? []) {
      if (t.is_transfer || t.direction !== wantDir) continue;
      flag.set(t.id, `${it.direction} "${it.description}"`);
    }
  }

  console.log(`India-transfer rows in ledger to exclude: ${flag.size}\n`);
  const byId = new Map((tx ?? []).map((t) => [t.id, t]));
  for (const [id, why] of flag) {
    const t = byId.get(id)!;
    console.log(`  ${t.txn_date}  ${(t.direction === "inflow" ? "+" : "-") + "$" + t.amount}  ${acctName.get(t.account_id)}  "${t.description}"  (${why})`);
  }

  if (dryRun) {
    console.log("\n(dry run — nothing changed)");
    return;
  }
  const ids = [...flag.keys()];
  if (ids.length) {
    const { error } = await supabase
      .from("transactions")
      .update({ is_transfer: true, category_id: null, inflow_type_id: null, whose_expense: null, debtor_id: null })
      .in("id", ids)
      .eq("user_id", user.id);
    if (error) throw error;
  }
  console.log(`\nExcluded ${ids.length} India-transfer rows from income/expense (kept in balances).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
