"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ACCOUNT_TYPES } from "@/lib/defaults";
import { accountActivity } from "@/lib/calc";

type TxnInsert = Database["public"]["Tables"]["transactions"]["Insert"];

const schema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  bank: z.string().trim().min(1).optional(),
  type: z.enum(ACCOUNT_TYPES),
  // The desired CURRENT balance. We back-solve opening_balance so that
  // opening_balance + Σ(signed transactions) == this value.
  balance: z.coerce.number(),
  include_in_net_worth: z.boolean(),
});

export type AccountInput = z.input<typeof schema>;
type ActionResult = { ok: boolean; error?: string };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidate() {
  for (const p of ["/accounts", "/"]) revalidatePath(p);
}

/**
 * The net activity layered on top of opening_balance to reach the displayed
 * balance. MUST match accountActivity() in calc.ts exactly, which is:
 *   opening_balance + delta + linked
 * where `delta` is the signed sum of the account's own transactions and `linked`
 * is category-linked credit: non-transfer outflows in categories that point here
 * as their destination (e.g. "Tuition Vault" -> Marcus HYSA) raise this balance.
 * Missing the `linked` term made the balance back-solve wrong for any linked
 * destination account (Marcus HYSA, RobinHood).
 */
async function activityFor(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
): Promise<number> {
  const { data: own } = await supabase
    .from("transactions")
    .select("direction, amount")
    .eq("user_id", userId)
    .eq("account_id", accountId);
  const delta = (own ?? []).reduce(
    (s, t) => s + (t.direction === "inflow" ? t.amount : -t.amount),
    0,
  );

  // Categories whose linked_account_id points at this account.
  const { data: cats } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("linked_account_id", accountId);
  const catIds = (cats ?? []).map((c) => c.id);
  let linked = 0;
  if (catIds.length > 0) {
    const { data: linkedTxns } = await supabase
      .from("transactions")
      .select("amount, direction, is_transfer")
      .eq("user_id", userId)
      .in("category_id", catIds);
    linked = (linkedTxns ?? []).reduce(
      (s, t) => s + (t.direction === "outflow" && !t.is_transfer ? t.amount : 0),
      0,
    );
  }

  return delta + linked;
}

function isUniqueViolation(message: string): boolean {
  return /duplicate key|unique constraint|already exists/i.test(message);
}
function isForeignKeyViolation(message: string): boolean {
  return /foreign key|violates foreign key constraint|still referenced/i.test(message);
}

export async function createAccount(input: AccountInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { count } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const d = parsed.data;
  // New account has no transactions, so opening_balance = desired balance.
  const { error } = await supabase.from("accounts").insert({
    user_id: user.id,
    name: d.name,
    bank: d.bank?.trim() || "Other",
    type: d.type,
    is_credit: d.type === "credit_card",
    opening_balance: round2(d.balance),
    include_in_net_worth: d.include_in_net_worth,
    display_order: count ?? 0,
  });
  if (error) {
    return { ok: false, error: isUniqueViolation(error.message) ? "An account with that name already exists." : error.message };
  }
  revalidate();
  return { ok: true };
}

export async function updateAccount(id: string, input: AccountInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const d = parsed.data;
  const activity = await activityFor(supabase, user.id, id);
  const { error } = await supabase
    .from("accounts")
    .update({
      name: d.name,
      bank: d.bank?.trim() || "Other",
      type: d.type,
      is_credit: d.type === "credit_card",
      // Back-solve so the displayed (opening + activity) equals the desired balance.
      opening_balance: round2(d.balance - activity),
      include_in_net_worth: d.include_in_net_worth,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return { ok: false, error: isUniqueViolation(error.message) ? "An account with that name already exists." : error.message };
  }
  revalidate();
  return { ok: true };
}

const transferSchema = z.object({
  from_account_id: z.string().uuid("Pick the account money leaves."),
  to_account_id: z.string().uuid("Pick the account money goes to."),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  date: z.string().min(10),
  note: z.string().trim().nullable().optional(),
});
export type TransferInput = z.input<typeof transferSchema>;

/**
 * Log a transfer between two accounts: an outflow on `from` and an inflow on
 * `to`. Both legs update balances but never count as income or spending.
 *
 * Special case - moving money INTO an account that's excluded from net worth
 * (a savings/investment stash like Marcus HYSA or RobinHood): that's saving,
 * not a neutral shuffle. Because the destination sits outside net worth, a plain
 * transfer would drop net worth without anything to balance it (it'd leak into
 * the "settled" residual and overstate spending). So the source leg is booked as
 * a `savings` outflow (counts toward savings, offsets the net-worth drop) while
 * the destination leg stays a transfer that simply grows the stash's balance.
 *
 * Paying a credit card => from = checking, to = card: the card's negative (owed)
 * balance rises toward 0 while checking drops.
 */
export async function logTransfer(input: TransferInput): Promise<ActionResult> {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  if (d.from_account_id === d.to_account_id) {
    return { ok: false, error: "Choose two different accounts." };
  }
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: accts } = await supabase
    .from("accounts")
    .select("id, name, include_in_net_worth")
    .eq("user_id", user.id)
    .in("id", [d.from_account_id, d.to_account_id]);
  // Both legs must be accounts this user owns - don't just read ownership, require
  // it, so a transfer can't reference an account id that isn't yours.
  const owned = new Set((accts ?? []).map((a) => a.id));
  if (!owned.has(d.from_account_id) || !owned.has(d.to_account_id)) {
    return { ok: false, error: "Account not found." };
  }
  const nameOf = (id: string) => accts?.find((a) => a.id === id)?.name ?? "account";
  const note = d.note?.trim() || null;
  const amount = round2(d.amount);

  // Destination outside net worth => this is a savings deposit, not a shuffle.
  const toExcluded = accts?.find((a) => a.id === d.to_account_id)?.include_in_net_worth === false;

  const source: TxnInsert = toExcluded
    ? {
        user_id: user.id,
        txn_date: d.date,
        account_id: d.from_account_id,
        description: note ?? `Savings to ${nameOf(d.to_account_id)}`,
        direction: "outflow",
        amount,
        is_transfer: false,
        budget_group: "savings",
        whose_expense: "My",
      }
    : {
        user_id: user.id,
        txn_date: d.date,
        account_id: d.from_account_id,
        description: note ?? `Transfer to ${nameOf(d.to_account_id)}`,
        direction: "outflow",
        amount,
        is_transfer: true,
      };

  const destination: TxnInsert = {
    user_id: user.id,
    txn_date: d.date,
    account_id: d.to_account_id,
    description: note ?? `Transfer from ${nameOf(d.from_account_id)}`,
    direction: "inflow",
    amount,
    is_transfer: true,
  };

  const { error } = await supabase.from("transactions").insert([source, destination]);
  if (error) return { ok: false, error: error.message };
  for (const p of ["/accounts", "/", "/transactions", "/insights", "/budget"]) revalidatePath(p);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bulk transfer import - reconcile the ledger against bank statements by adding
// the transfers (chiefly credit-card paydowns) that were never logged. CRITICAL
// invariant: the DISPLAYED balance of every account is held constant. Adding a
// transfer normally moves both legs' balances, so after inserting we re-solve
// each touched account's opening_balance by exactly the net legs we added
// (newOpening = oldOpening − netLegs). Because displayed = opening + activity and
// activity grew by netLegs, the displayed balance is unchanged, while the fake
// opening "plugs" that were absorbing the missing paydowns collapse toward zero.
// ---------------------------------------------------------------------------
const importRowSchema = z.object({
  date: z.string().min(10, "Each row needs a date (YYYY-MM-DD)."),
  from: z.string().trim().min(1, "Each row needs a 'from' account."),
  to: z.string().trim().min(1, "Each row needs a 'to' account."),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  note: z.string().trim().nullable().optional(),
});
export type ImportRow = z.input<typeof importRowSchema>;

export interface ImportAccountPreview {
  account: string;
  balanceBefore: number;
  balanceAfter: number; // always == balanceBefore; shown to prove it
  openingBefore: number;
  openingAfter: number;
  netLegs: number;
}
export interface ImportPreview {
  ok: boolean;
  error?: string;
  transfers?: number;
  accounts?: ImportAccountPreview[];
}

async function loadForImport(supabase: SupabaseClient<Database>, userId: string) {
  const [txnsRes, accountsRes, catsRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", userId),
    supabase.from("accounts").select("*").eq("user_id", userId).order("display_order"),
    supabase.from("categories").select("id, linked_account_id").eq("user_id", userId),
  ]);
  const accounts = accountsRes.data ?? [];
  const activity = accountActivity(txnsRes.data ?? [], accounts, catsRes.data ?? []);
  const balById = new Map(activity.map((a) => [a.account.id, a.balance]));
  return { accounts, balById };
}

type ResolvedTransfer = {
  from: Database["public"]["Tables"]["accounts"]["Row"];
  to: Database["public"]["Tables"]["accounts"]["Row"];
  amount: number;
  date: string;
  note: string | null;
};

function resolveTransfers(
  rows: z.infer<typeof importRowSchema>[],
  accounts: Database["public"]["Tables"]["accounts"]["Row"][],
) {
  const byName = new Map(accounts.map((a) => [a.name.trim().toLowerCase(), a]));
  const resolved: ResolvedTransfer[] = [];
  const unmatched = new Set<string>();
  for (const r of rows) {
    const from = byName.get(r.from.trim().toLowerCase());
    const to = byName.get(r.to.trim().toLowerCase());
    if (!from) unmatched.add(r.from);
    if (!to) unmatched.add(r.to);
    if (!from || !to) continue;
    if (from.id === to.id) {
      unmatched.add(`${r.from} → ${r.to} (same account)`);
      continue;
    }
    resolved.push({ from, to, amount: round2(r.amount), date: r.date.slice(0, 10), note: r.note?.trim() || null });
  }
  return { resolved, unmatched: [...unmatched] };
}

function netLegsByAccount(resolved: ResolvedTransfer[]): Map<string, number> {
  const legs = new Map<string, number>();
  for (const t of resolved) {
    legs.set(t.from.id, round2((legs.get(t.from.id) ?? 0) - t.amount));
    legs.set(t.to.id, round2((legs.get(t.to.id) ?? 0) + t.amount));
  }
  return legs;
}

export async function previewTransferImport(rowsInput: ImportRow[]): Promise<ImportPreview> {
  const parsed = z.array(importRowSchema).min(1, "Nothing to import.").safeParse(rowsInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { accounts, balById } = await loadForImport(supabase, user.id);
  const { resolved, unmatched } = resolveTransfers(parsed.data, accounts);
  if (unmatched.length) return { ok: false, error: `Unrecognized account(s): ${unmatched.join(", ")}` };

  const legs = netLegsByAccount(resolved);
  const rows: ImportAccountPreview[] = [];
  for (const a of accounts) {
    const net = legs.get(a.id);
    if (net == null) continue;
    const bal = round2(balById.get(a.id) ?? 0);
    rows.push({
      account: a.name,
      balanceBefore: bal,
      balanceAfter: bal, // opening drops by net, activity rises by net => unchanged
      openingBefore: round2(a.opening_balance),
      openingAfter: round2(a.opening_balance - net),
      netLegs: net,
    });
  }
  return { ok: true, transfers: resolved.length, accounts: rows };
}

export async function commitTransferImport(rowsInput: ImportRow[]): Promise<ActionResult & { inserted?: number }> {
  const parsed = z.array(importRowSchema).min(1, "Nothing to import.").safeParse(rowsInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { accounts } = await loadForImport(supabase, user.id);
  const { resolved, unmatched } = resolveTransfers(parsed.data, accounts);
  if (unmatched.length) return { ok: false, error: `Unrecognized account(s): ${unmatched.join(", ")}` };

  const inserts: TxnInsert[] = [];
  for (const t of resolved) {
    // Mirror logTransfer: a destination outside net worth is a savings deposit.
    const toExcluded = t.to.include_in_net_worth === false;
    inserts.push(
      toExcluded
        ? {
            user_id: user.id, txn_date: t.date, account_id: t.from.id,
            description: t.note ?? `Savings to ${t.to.name}`, direction: "outflow",
            amount: t.amount, is_transfer: false, budget_group: "savings", whose_expense: "My",
          }
        : {
            user_id: user.id, txn_date: t.date, account_id: t.from.id,
            description: t.note ?? `Transfer to ${t.to.name}`, direction: "outflow",
            amount: t.amount, is_transfer: true,
          },
    );
    inserts.push({
      user_id: user.id, txn_date: t.date, account_id: t.to.id,
      description: t.note ?? `Transfer from ${t.from.name}`, direction: "inflow",
      amount: t.amount, is_transfer: true,
    });
  }

  const { error: insErr } = await supabase.from("transactions").insert(inserts);
  if (insErr) return { ok: false, error: insErr.message };

  // Hold every touched account's displayed balance fixed by re-solving its opening.
  const legs = netLegsByAccount(resolved);
  for (const a of accounts) {
    const net = legs.get(a.id);
    if (net == null) continue;
    const { error: updErr } = await supabase
      .from("accounts")
      .update({ opening_balance: round2(a.opening_balance - net) })
      .eq("id", a.id)
      .eq("user_id", user.id);
    if (updErr) return { ok: false, error: updErr.message };
  }

  for (const p of ["/accounts", "/", "/transactions", "/insights", "/budget"]) revalidatePath(p);
  return { ok: true, inserted: inserts.length };
}

// ---------------------------------------------------------------------------
// Statement reconciliation - the going-forward safeguard, with CHECKPOINTS.
//
// Every account carries a checkpoint: (reconciled_through, reconciled_balance)
// = the last statement whose closing balance you verified. Reconciling a newer
// statement measures FORWARD from that checkpoint over just the one closed cycle
// (checkpoint date -> new statement date), so an open/incomplete current month
// can no longer throw off an older statement. Only when there is no earlier
// checkpoint do we fall back to walking back from today's balance.
//
// A match auto-stamps the checkpoint forward. When the ledger is momentarily
// behind (the check is off) you can still attest a statement straight from the
// paper via attestReconciliation - the statement is ground truth - which stamps
// the checkpoint so the next cycle measures cleanly from there.
// ---------------------------------------------------------------------------
const reconcileSchema = z.object({
  account_id: z.string().uuid("Pick an account."),
  as_of_date: z.string().min(10, "Enter the statement closing date."),
  statement_balance: z.coerce.number(),
});
export type ReconcileInput = z.input<typeof reconcileSchema>;

export interface ReconcileResult {
  ok: boolean;
  error?: string;
  account?: string;
  isCredit?: boolean;
  asOf?: string;
  ledgerBalance?: number;
  statementBalance?: number;
  difference?: number;
  reconciled?: boolean;
  attested?: boolean; // stamped from the statement despite a ledger mismatch
  recordedThrough?: string | null;
  // How the ledger balance was derived, so the UI can explain the check.
  basis?: "checkpoint" | "current";
  measuredFrom?: string | null; // checkpoint date, forward mode
  measuredFromBalance?: number | null; // checkpoint balance, forward mode
  periodTxns?: { date: string; description: string; signed: number }[];
}

type TxnRow = Database["public"]["Tables"]["transactions"]["Row"];

// Signed movement on the account within a date window, matching accountActivity:
// its own transactions plus category-linked credits (Tuition Vault/Investment
// deposits). `afterExclusive`/`uptoInclusive` are ISO dates; null = open end.
function windowActivity(
  txns: TxnRow[],
  acctId: string,
  linkedCatIds: Set<string>,
  afterExclusive: string | null,
  uptoInclusive: string | null,
): number {
  let sum = 0;
  for (const t of txns) {
    if (afterExclusive != null && t.txn_date <= afterExclusive) continue;
    if (uptoInclusive != null && t.txn_date > uptoInclusive) continue;
    if (t.account_id === acctId) sum += t.direction === "inflow" ? t.amount : -t.amount;
    else if (t.direction === "outflow" && !t.is_transfer && t.category_id && linkedCatIds.has(t.category_id)) sum += t.amount;
  }
  return sum;
}

// Log the reconciliation to history: one durable row per statement. Upsert on
// (account, as_of_date) so re-reconciling a statement updates its record rather
// than duplicating it.
async function recordReconciliation(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
  asOf: string,
  statementBalance: number,
  method: "matched" | "attested",
  ledgerBalance: number | null,
  difference: number | null,
): Promise<void> {
  await supabase.from("account_reconciliations").upsert(
    {
      user_id: userId,
      account_id: accountId,
      as_of_date: asOf,
      statement_balance: statementBalance,
      ledger_balance: ledgerBalance,
      difference,
      method,
    },
    { onConflict: "user_id,account_id,as_of_date" },
  );
}

// Move the account's checkpoint forward to this statement's date + balance.
// Returns the new reconciled_through, or `fallback` on failure.
async function moveCheckpoint(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
  asOf: string,
  balance: number,
  fallback: string | null,
): Promise<string | null> {
  const { error } = await supabase
    .from("accounts")
    .update({ reconciled_through: asOf, reconciled_balance: balance })
    .eq("id", accountId)
    .eq("user_id", userId);
  return error ? fallback : asOf;
}

export async function reconcileAccount(input: ReconcileInput): Promise<ReconcileResult> {
  const parsed = reconcileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const d = parsed.data;

  const [acctRes, txnsRes, catsRes] = await Promise.all([
    supabase.from("accounts").select("*").eq("id", d.account_id).eq("user_id", user.id).maybeSingle(),
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("categories").select("id, linked_account_id").eq("user_id", user.id),
  ]);
  const acct = acctRes.data;
  if (!acct) return { ok: false, error: "Account not found." };
  const txns = txnsRes.data ?? [];
  const cats = catsRes.data ?? [];
  const linkedCatIds = new Set(cats.filter((c) => c.linked_account_id === acct.id).map((c) => c.id));

  // Forward mode when there's an earlier checkpoint: measure just the one cycle
  // from it to the statement date, so the open current month is never in path.
  const hasCheckpoint =
    acct.reconciled_through != null &&
    acct.reconciled_balance != null &&
    acct.reconciled_through < d.as_of_date;

  let ledgerBalance: number;
  let basis: "checkpoint" | "current";
  let windowStart: string | null; // exclusive lower bound of the eyeball list
  if (hasCheckpoint) {
    const cycle = windowActivity(txns, acct.id, linkedCatIds, acct.reconciled_through, d.as_of_date);
    ledgerBalance = round2((acct.reconciled_balance ?? 0) + cycle);
    basis = "checkpoint";
    windowStart = acct.reconciled_through;
  } else {
    const current = accountActivity(txns, [acct], cats).find((a) => a.account.id === acct.id)?.balance ?? 0;
    const after = windowActivity(txns, acct.id, linkedCatIds, d.as_of_date, null);
    ledgerBalance = round2(current - after);
    basis = "current";
    // ~40 days before the statement date, so there's a period to eyeball.
    const start = new Date(`${d.as_of_date.slice(0, 10)}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 40);
    windowStart = start.toISOString().slice(0, 10);
  }

  const difference = round2(ledgerBalance - round2(d.statement_balance));
  const reconciled = Math.abs(difference) < 0.005;

  // A clean match is logged to history and moves the checkpoint forward.
  let recordedThrough = acct.reconciled_through;
  if (reconciled) {
    await recordReconciliation(supabase, user.id, acct.id, d.as_of_date, round2(d.statement_balance), "matched", ledgerBalance, difference);
    if (!acct.reconciled_through || d.as_of_date > acct.reconciled_through) {
      recordedThrough = await moveCheckpoint(supabase, user.id, acct.id, d.as_of_date, round2(d.statement_balance), recordedThrough);
    }
    revalidatePath("/accounts");
    revalidatePath("/accounts/reconcile");
  }

  // The transactions inside the measured window, to compare line-by-line against
  // the statement: (checkpoint, statement] in forward mode, else the ~40d run-up.
  const periodTxns = txns
    .filter((t) => t.account_id === acct.id && t.txn_date <= d.as_of_date && (windowStart == null || t.txn_date > windowStart))
    .sort((a, b) => (a.txn_date < b.txn_date ? -1 : a.txn_date > b.txn_date ? 1 : 0))
    .map((t) => ({ date: t.txn_date, description: t.description, signed: round2(t.direction === "inflow" ? t.amount : -t.amount) }));

  return {
    ok: true,
    account: acct.name,
    isCredit: acct.is_credit,
    asOf: d.as_of_date,
    ledgerBalance,
    statementBalance: round2(d.statement_balance),
    difference,
    reconciled,
    recordedThrough,
    basis,
    measuredFrom: hasCheckpoint ? acct.reconciled_through : null,
    measuredFromBalance: hasCheckpoint ? round2(acct.reconciled_balance ?? 0) : null,
    periodTxns,
  };
}

// Attest a statement balance straight from the paper, even when the live ledger
// is momentarily behind. The statement is ground truth; this stamps the
// checkpoint forward so the next cycle measures cleanly from here. Refuses to
// move the checkpoint backward past an already-reconciled later date.
export async function attestReconciliation(input: ReconcileInput): Promise<ReconcileResult> {
  const parsed = reconcileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const d = parsed.data;

  const { data: acct } = await supabase
    .from("accounts").select("*").eq("id", d.account_id).eq("user_id", user.id).maybeSingle();
  if (!acct) return { ok: false, error: "Account not found." };
  if (acct.reconciled_through && d.as_of_date < acct.reconciled_through) {
    return { ok: false, error: `Already reconciled through ${acct.reconciled_through}, which is later than ${d.as_of_date}.` };
  }
  await recordReconciliation(supabase, user.id, acct.id, d.as_of_date, round2(d.statement_balance), "attested", null, null);
  const recordedThrough = await moveCheckpoint(supabase, user.id, acct.id, d.as_of_date, round2(d.statement_balance), acct.reconciled_through);
  revalidatePath("/accounts");
  revalidatePath("/accounts/reconcile");
  return {
    ok: true,
    account: acct.name,
    isCredit: acct.is_credit,
    asOf: d.as_of_date,
    statementBalance: round2(d.statement_balance),
    reconciled: true,
    attested: true,
    recordedThrough,
  };
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase.from("accounts").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    return {
      ok: false,
      error: isForeignKeyViolation(error.message)
        ? "Account has transactions; reassign or delete them first."
        : error.message,
    };
  }
  revalidate();
  return { ok: true };
}
