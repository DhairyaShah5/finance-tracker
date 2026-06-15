// One-off: set each account's stored opening_balance so the LIVE computed
// balance (opening + Σ signed transactions) equals the user's exact targets,
// and record Vivek's outstanding $70. Run: SEED_EMAIL=... npx tsx scripts/fix-balances.ts

import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}

// Load .env.local
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

const TARGETS: Record<string, number> = {
  "Chase Checking": 814.91,
  "BofA Checking": 2244.53,
  "Chase Credit Card": 0,
  "BofA Credit Card": 0,
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });

  const email = process.env.SEED_EMAIL;
  const { data: list } = await supabase.auth.admin.listUsers();
  const user = list.users.find((u) => u.email?.toLowerCase() === email?.toLowerCase());
  if (!user) throw new Error(`No user for ${email}`);

  const [{ data: txns }, { data: accounts }] = await Promise.all([
    supabase.from("transactions").select("account_id, direction, amount").eq("user_id", user.id),
    supabase.from("accounts").select("id, name").eq("user_id", user.id),
  ]);

  // Σ signed per account (all transactions affect the balance).
  const delta = new Map<string, number>();
  for (const t of txns ?? []) {
    delta.set(t.account_id, (delta.get(t.account_id) ?? 0) + (t.direction === "inflow" ? t.amount : -t.amount));
  }

  for (const a of accounts ?? []) {
    const target = TARGETS[a.name] ?? 0;
    const d = round2(delta.get(a.id) ?? 0);
    const opening = round2(target - d);
    await supabase.from("accounts").update({ opening_balance: opening }).eq("id", a.id);
    console.log(`${a.name.padEnd(20)} target=${target.toFixed(2).padStart(9)}  Σsigned=${d.toFixed(2).padStart(10)}  opening=${opening.toFixed(2).padStart(10)}`);
  }

  // Vivek owes $70 (everything else settled).
  await supabase.from("debtors").upsert(
    { user_id: user.id, name: "Vivek", amount: 70, note: "iPhone" },
    { onConflict: "user_id,name" },
  );
  console.log("Debtor upserted: Vivek $70");

  const netWorth = (accounts ?? []).reduce((s, a) => s + (TARGETS[a.name] ?? 0), 0);
  console.log("Net worth target =", round2(netWorth));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
