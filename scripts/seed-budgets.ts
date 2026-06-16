// One-off: seed recommended monthly category budgets. Grounded in 10 months of
// actuals (Aug 2025-May 2026), trimming discretionary categories so total spend
// lands ~$1,775/mo, comfortably under the recent ~$2,350/mo income run-rate and
// leaving room to save. Every number is editable in Settings.
// Run: SEED_EMAIL=... npx tsx scripts/seed-budgets.ts
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
try {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq === -1) continue;
    const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
} catch {}

const BUDGETS: Record<string, number> = {
  "Rent and Utilities": 850,
  "Health Insurance": 195,
  "Groceries": 130,
  "Eating Out": 150,
  "Transportation": 50,
  "Entertainment": 60,
  "Travelling": 70,
  "Personal Care": 35,
  "Shopping": 35,
  "Electronics": 50,
  "Home Improvement": 25,
  "Education & Fees": 40,
  "Gifting": 25,
  "Miscellaneous": 40,
  "Health & Fitness": 20,
};

async function main() {
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: list } = await supabase.auth.admin.listUsers();
  const user = list.users.find((u) => u.email?.toLowerCase() === process.env.SEED_EMAIL?.toLowerCase());
  if (!user) throw new Error("no user");
  const { data: cats } = await supabase.from("categories").select("id,name").eq("user_id", user.id);
  let n = 0, total = 0;
  for (const c of cats ?? []) {
    const b = BUDGETS[c.name];
    if (b == null) continue;
    await supabase.from("categories").update({ monthly_budget: b }).eq("id", c.id);
    n++; total += b;
    console.log(`${c.name.padEnd(20)} $${b}/mo`);
  }
  console.log(`\nSeeded ${n} category budgets, total $${total}/mo.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
