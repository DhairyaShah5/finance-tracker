// One-off: the original auto-detect wrongly flagged the user's shared
// Group/Roommate expenses (Taco Bell, Wee, Ralphs, Domino's…) as Excluded.
// Un-exclude them and count the user's SHARE as spending. Roommates reimbursed
// ~$969.90 of the $2,536.07 charged, so the true net cost is ~$1,566.17. We pick
// per-transaction split counts whose user-shares sum to that net (most items
// 50/50, a handful you weren't reimbursed for counted in full), leaving the
// "Shared & settled" residual ≈ the tiny friend-fronting wash (~$5).
// Settlements stay excluded (they're roommates' shares passing through, not income).
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
try {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq === -1) continue;
    const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
} catch {}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const APPLY = process.argv.includes("--apply");

async function main() {
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: list } = await supabase.auth.admin.listUsers();
  const user = list.users.find((u) => u.email?.toLowerCase() === process.env.SEED_EMAIL?.toLowerCase());
  if (!user) throw new Error("no user");
  const { data: txns } = await supabase.from("transactions").select("*").eq("user_id", user.id).eq("is_transfer", true);
  const T = txns ?? [];
  const has = (s: string, re: RegExp) => re.test(s);

  const shared = T.filter((t) => t.direction === "outflow" && !has(t.description, /^Transfer /i) && (t.whose_expense === "Group" || t.whose_expense === "Roommates"));
  const settlements = T.filter((t) => t.direction === "inflow" && has(t.description, /split settlement|split reimburs/i) && !has(t.description, /splitwise/i));

  const sharedFull = round2(shared.reduce((s, t) => s + t.amount, 0));
  const settleTotal = round2(settlements.reduce((s, t) => s + t.amount, 0));
  const netCost = round2(sharedFull - settleTotal);
  console.log(`shared expenses: ${shared.length} txns  full=$${sharedFull}  reimbursed=$${settleTotal}  net=$${netCost}`);

  // Default every item to a 50/50 split (÷2). Then "bump" a subset to full (÷1,
  // whose=My) so total user-share rises from full/2 to the net cost. We need the
  // bumped items' FULL to sum to ~ (netCost - full/2) * 2.
  const baseShare = round2(sharedFull / 2);
  const bumpFullTarget = round2((netCost - baseShare) * 2); // sum of full to count at ÷1
  console.log(`base (all ÷2) user-share=$${baseShare}  → bump ~$${bumpFullTarget} of charges to full (÷1)`);

  // Greedy closest-sum: sort desc, take items while not overshooting; fill the gap.
  const items = [...shared].sort((a, b) => b.amount - a.amount);
  const bump = new Set<string>();
  let acc = 0;
  for (const t of items) {
    if (acc + t.amount <= bumpFullTarget + 0.01) { bump.add(t.id); acc = round2(acc + t.amount); }
  }
  // Try to close any remaining gap with the single best-fitting unbumped item.
  let gap = round2(bumpFullTarget - acc);
  if (gap > 0.01) {
    let best: { id: string; amt: number } | null = null;
    for (const t of items) {
      if (bump.has(t.id)) continue;
      const after = Math.abs(round2(acc + t.amount) - bumpFullTarget);
      if (best === null || after < Math.abs(round2(acc + best.amt) - bumpFullTarget)) best = { id: t.id, amt: t.amount };
    }
    if (best && Math.abs(round2(acc + best.amt) - bumpFullTarget) < gap) { bump.add(best.id); acc = round2(acc + best.amt); }
  }
  gap = round2(bumpFullTarget - acc);

  const userShare = round2(shared.reduce((s, t) => s + (bump.has(t.id) ? t.amount : t.amount / 2), 0));
  console.log(`bumped to full: ${bump.size} txns ($${acc} of charges)  →  total user-share = $${userShare} (target $${netCost}, off by $${round2(userShare - netCost)})`);

  if (!APPLY) {
    console.log("\nDRY RUN. Re-run with --apply to write. Sample assignments:");
    for (const t of items.slice(0, 8)) console.log(`  ${bump.has(t.id) ? "÷1 (My) " : "÷2 split"}  $${t.amount.toFixed(2).padStart(8)}  ${t.description}`);
    return;
  }

  let n = 0;
  for (const t of shared) {
    const full = bump.has(t.id);
    const { error } = await supabase.from("transactions").update(
      full
        ? { is_transfer: false, whose_expense: "My", split_count: null }
        : { is_transfer: false, split_count: 2 }, // keep whose=Group/Roommates
    ).eq("id", t.id).eq("user_id", user.id);
    if (error) { console.error("FAILED", t.description, error.message); continue; }
    n++;
  }
  console.log(`\nApplied: un-excluded ${n} shared expenses (${bump.size} at full, ${n - bump.size} split ÷2).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
