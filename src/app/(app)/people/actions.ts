"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { myAmount, outstandingReceivable, outstandingPayable } from "@/lib/calc";
import type { Database, TransactionRow, TransactionDebtorRow } from "@/lib/database.types";

type TxnInsert = Database["public"]["Tables"]["transactions"]["Insert"];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type ActionResult = { ok: boolean; error?: string };

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidate() {
  for (const p of ["/people", "/", "/accounts", "/transactions", "/insights", "/budget"]) revalidatePath(p);
}

// ===========================================================================
// Debtors - people who owe YOU. Adding a debtor records a real fronted expense:
// the money left an account of yours, so a debtor is inseparable from the
// transaction that created the debt. Its balance is then DERIVED from that (and
// any other) linked expense - never stored - which is what keeps "owed to me"
// from counting the same debt twice.
// ===========================================================================
const createDebtorSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  account_id: z.string().uuid("Pick an account."),
  txn_date: z.string().min(10),
  category_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().nullable().optional(),
});
const editDebtorSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  note: z.string().trim().nullable().optional(),
});

export type DebtorInput = z.input<typeof createDebtorSchema>;
export type DebtorEditInput = z.input<typeof editDebtorSchema>;

/** Map common Postgres errors to friendly text. */
function friendlyDebtorError(message: string): string {
  if (/duplicate key|unique/i.test(message)) return "A debtor with that name already exists.";
  return message;
}

export async function createDebtor(input: DebtorInput): Promise<ActionResult> {
  const parsed = createDebtorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const d = parsed.data;
  const desc = d.description?.trim() || `Fronted for ${d.name}`;

  // Re-use a debtor of the same name if one exists, otherwise create the person.
  const { data: existing } = await supabase
    .from("debtors")
    .select("id")
    .eq("user_id", user.id)
    .ilike("name", d.name)
    .maybeSingle();
  let debtorId = existing?.id ?? null;
  if (!debtorId) {
    const { data: created, error: cErr } = await supabase
      .from("debtors")
      .insert({ user_id: user.id, name: d.name, amount: 0, note: desc })
      .select("id")
      .single();
    if (cErr || !created) return { ok: false, error: friendlyDebtorError(cErr?.message ?? "Failed to add debtor.") };
    debtorId = created.id;
  }

  // The debt itself: a Friend expense fronted from your account, owed back.
  const row: TxnInsert = {
    user_id: user.id,
    txn_date: d.txn_date,
    account_id: d.account_id,
    amount: d.amount,
    direction: "outflow",
    whose_expense: "Friend",
    reimbursable: true,
    debtor_id: debtorId,
    category_id: d.category_id || null,
    description: desc,
  };
  const { error: insErr } = await supabase.from("transactions").insert(row);
  if (insErr) return { ok: false, error: insErr.message };
  revalidate();
  return { ok: true };
}

export async function updateDebtor(id: string, input: DebtorEditInput): Promise<ActionResult> {
  const parsed = editDebtorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  // Only the label is editable now - the balance is derived from the ledger.
  const { error } = await supabase
    .from("debtors")
    .update({ name: parsed.data.name, note: parsed.data.note?.trim() || null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: friendlyDebtorError(error.message) };
  revalidate();
  return { ok: true };
}

export async function deleteDebtor(id: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  // FK on transactions.debtor_id is ON DELETE SET NULL, so attributed
  // transactions are simply un-assigned, not removed.
  const { error } = await supabase.from("debtors").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settle up - a debtor paid you back. Applies the repayment across the person's
// linked reimbursable expenses (oldest first):
//   "cash"    -> they sent money to one of your accounts. Booked as an excluded
//                inflow per expense (is_transfer, linked via reimburses_id so it
//                reverses on delete): raises your balance, but isn't income, and
//                the front stops being a receivable.
//   "in_kind" -> instead of paying you, they covered one of YOUR expenses. No
//                money moved, so no inflow is written; the fronted slice simply
//                becomes your own spending (a write-off via my_share).
// ---------------------------------------------------------------------------
const settleDebtorSchema = z.object({
  debtor_id: z.string().uuid(),
  mode: z.enum(["cash", "in_kind"]),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  account_id: z.string().uuid().nullable().optional(),
  txn_date: z.string().min(10).nullable().optional(),
  description: z.string().trim().nullable().optional(),
});

export type SettleInput = z.input<typeof settleDebtorSchema>;

export async function settleDebtor(input: SettleInput): Promise<ActionResult> {
  const parsed = settleDebtorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const d = parsed.data;
  if (d.mode === "cash" && !d.account_id) {
    return { ok: false, error: "Pick an account for the cash repayment." };
  }

  const { data: debtor, error: dErr } = await supabase
    .from("debtors")
    .select("id,name")
    .eq("id", d.debtor_id)
    .eq("user_id", user.id)
    .single();
  if (dErr || !debtor) return { ok: false, error: "Debtor not found." };

  // What this person owes comes from two places, both oldest-first:
  //   legacy  - a whole reimbursable expense fronted for them (transactions.debtor_id)
  //   link    - their slice of a split bill (transaction_debtors), debtor_id null on
  //             the parent, so the two sets never overlap.
  const { data: legacyExpenses } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("debtor_id", debtor.id)
    .eq("direction", "outflow")
    .eq("is_transfer", false)
    .eq("reimbursable", true)
    .order("txn_date", { ascending: true });

  const { data: links } = await supabase
    .from("transaction_debtors")
    .select("*")
    .eq("user_id", user.id)
    .eq("debtor_id", debtor.id);
  const linkTxnIds = [...new Set((links ?? []).map((l) => l.transaction_id))];
  const { data: linkTxns } = linkTxnIds.length
    ? await supabase.from("transactions").select("*").eq("user_id", user.id).in("id", linkTxnIds)
    : { data: [] as TransactionRow[] };
  const txnById = new Map((linkTxns ?? []).map((t) => [t.id, t]));

  type Item =
    | { kind: "legacy"; e: TransactionRow; out: number }
    | { kind: "link"; e: TransactionRow; link: TransactionDebtorRow; out: number };
  const items: Item[] = [];
  for (const e of legacyExpenses ?? []) {
    const out = outstandingReceivable(e);
    if (out > 0.005) items.push({ kind: "legacy", e, out });
  }
  for (const l of links ?? []) {
    const e = txnById.get(l.transaction_id);
    if (!e) continue;
    const out = round2(l.share - l.settled_amount);
    if (out > 0.005) items.push({ kind: "link", e, link: l, out });
  }
  items.sort((a, b) => (a.e.txn_date < b.e.txn_date ? -1 : a.e.txn_date > b.e.txn_date ? 1 : 0));

  const totalOut = round2(items.reduce((s, x) => s + x.out, 0));
  const settleAmt = round2(Math.min(d.amount, totalOut));
  if (settleAmt <= 0) return { ok: false, error: "Nothing left to settle." };

  const label = d.description?.trim() || null;
  const when = d.txn_date || new Date().toISOString().slice(0, 10);
  let remaining = settleAmt;
  for (const item of items) {
    if (remaining <= 0.005) break;
    const { e, out } = item;
    const take = round2(Math.min(remaining, out));

    if (d.mode === "cash") {
      const row: TxnInsert = {
        user_id: user.id,
        txn_date: when,
        account_id: d.account_id!,
        amount: take,
        direction: "inflow",
        is_transfer: true, // fronted money returning - excluded from income, raises balance
        debtor_id: debtor.id,
        reimburses_id: e.id, // link back so deleting the repayment restores the debt
        description: label || `${debtor.name} repaid`,
        notes: `Repaid ${take.toFixed(2)} toward "${e.description}".`,
      };
      const { error: insErr } = await supabase.from("transactions").insert(row);
      if (insErr) return { ok: false, error: insErr.message };
      // Cash drops the receivable via reimbursed_amount (money came back).
      const owed = round2(e.amount - myAmount(e));
      const newReimbursed = round2((e.reimbursed_amount ?? 0) + take);
      const { error: updErr } = await supabase
        .from("transactions")
        .update({ reimbursed_amount: newReimbursed, reimbursed: newReimbursed >= owed - 0.005 })
        .eq("id", e.id)
        .eq("user_id", user.id);
      if (updErr) return { ok: false, error: updErr.message };
      if (item.kind === "link") {
        const { error: lErr } = await supabase
          .from("transaction_debtors")
          .update({ settled_amount: round2((item.link.settled_amount ?? 0) + take) })
          .eq("id", item.link.id)
          .eq("user_id", user.id);
        if (lErr) return { ok: false, error: lErr.message };
      }
    } else if (item.kind === "link") {
      // Paid in kind on a split: they covered your expense, so their slice
      // becomes your own spending (my_share up), and their slice is settled. The
      // receivable falls by `take` while consumption rises by the same - balanced.
      const newShare = round2(myAmount(e) + take);
      const owedAfter = round2(e.amount - newShare);
      const { error: updErr } = await supabase
        .from("transactions")
        .update({ my_share: newShare, reimbursed: (e.reimbursed_amount ?? 0) >= owedAfter - 0.005 })
        .eq("id", e.id)
        .eq("user_id", user.id);
      if (updErr) return { ok: false, error: updErr.message };
      const { error: lErr } = await supabase
        .from("transaction_debtors")
        .update({ settled_amount: round2((item.link.settled_amount ?? 0) + take) })
        .eq("id", item.link.id)
        .eq("user_id", user.id);
      if (lErr) return { ok: false, error: lErr.message };
    } else {
      // Paid in kind on a legacy fronted expense: the fronted slice becomes your
      // own spending (write-off), exactly as before.
      const newShare = round2(myAmount(e) + take);
      const { error: updErr } = await supabase
        .from("transactions")
        .update({ my_share: newShare, reimbursed: take >= out - 0.005 ? true : e.reimbursed })
        .eq("id", e.id)
        .eq("user_id", user.id);
      if (updErr) return { ok: false, error: updErr.message };
    }
    remaining = round2(remaining - take);
  }

  revalidate();
  return { ok: true };
}

// ===========================================================================
// Creditors - people YOU owe. The mirror of debtors: the balance is DERIVED from
// the ledger (borrowed − repaid), never hand-typed. A "borrow" is an excluded
// inflow (is_transfer, so it's not income) tagged with creditor_id.
//   "cash"    -> the friend sent money into one of your accounts. One borrow
//                inflow: raises that account, isn't income, owed back.
//   "in_kind" -> the friend paid for something of yours directly. A net-zero pair
//                on an account: the borrow inflow (the liability) plus your own
//                categorized expense outflow (the thing you consumed). Balance
//                nets to zero; your spending is real. The expense is tied to the
//                borrow via repays_id so deleting the borrow tears down both.
// ===========================================================================
const createCreditorSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  mode: z.enum(["cash", "in_kind"]),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  txn_date: z.string().min(10),
  // Required for cash (the account the money landed in). For in_kind it only
  // hosts the net-zero pair, so it's optional and defaults to your first account.
  account_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().nullable().optional(),
});
const editCreditorSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  note: z.string().trim().nullable().optional(),
});

export type CreditorInput = z.input<typeof createCreditorSchema>;
export type CreditorEditInput = z.input<typeof editCreditorSchema>;

function friendlyCreditorError(message: string): string {
  if (/duplicate key|unique/i.test(message)) return "A creditor with that name already exists.";
  return message;
}

export async function createCreditor(input: CreditorInput): Promise<ActionResult> {
  const parsed = createCreditorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const c = parsed.data;

  // Host account: cash needs the real account the money landed in; in_kind just
  // needs any account to carry the net-zero pair (fall back to the first one).
  let accountId = c.account_id ?? null;
  if (!accountId) {
    if (c.mode === "cash") return { ok: false, error: "Pick the account the money landed in." };
    const { data: first } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .order("display_order")
      .limit(1)
      .maybeSingle();
    accountId = first?.id ?? null;
    if (!accountId) return { ok: false, error: "Add an account first." };
  }

  const desc = c.description?.trim() || `Borrowed from ${c.name}`;

  // Re-use a creditor of the same name if one exists, otherwise create them.
  const { data: existing } = await supabase
    .from("creditors")
    .select("id")
    .eq("user_id", user.id)
    .ilike("name", c.name)
    .maybeSingle();
  let creditorId = existing?.id ?? null;
  if (!creditorId) {
    const { data: created, error: cErr } = await supabase
      .from("creditors")
      .insert({ user_id: user.id, name: c.name, note: desc })
      .select("id")
      .single();
    if (cErr || !created) return { ok: false, error: friendlyCreditorError(cErr?.message ?? "Failed to add creditor.") };
    creditorId = created.id;
  }

  // The borrow: an excluded inflow that raises the account but isn't income.
  const { data: borrow, error: bErr } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      txn_date: c.txn_date,
      account_id: accountId,
      amount: c.amount,
      direction: "inflow",
      is_transfer: true,
      creditor_id: creditorId,
      description: desc,
    } satisfies TxnInsert)
    .select("id")
    .single();
  if (bErr || !borrow) return { ok: false, error: bErr?.message ?? "Failed to record the borrow." };

  // They paid for something of yours directly: pair the borrow with a real
  // expense outflow so the account nets to zero and your spending is recorded.
  if (c.mode === "in_kind") {
    const expense: TxnInsert = {
      user_id: user.id,
      txn_date: c.txn_date,
      account_id: accountId,
      amount: c.amount,
      direction: "outflow",
      whose_expense: "My",
      creditor_id: creditorId,
      category_id: c.category_id || null,
      repays_id: borrow.id, // tie to the borrow so deleting it removes both halves
      description: desc,
      notes: `Paid by ${c.name}; you owe it back.`,
    };
    const { error: eErr } = await supabase.from("transactions").insert(expense);
    if (eErr) return { ok: false, error: eErr.message };
  }

  revalidate();
  return { ok: true };
}

export async function updateCreditor(id: string, input: CreditorEditInput): Promise<ActionResult> {
  const parsed = editCreditorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("creditors")
    .update({ name: parsed.data.name, note: parsed.data.note?.trim() || null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: friendlyCreditorError(error.message) };
  revalidate();
  return { ok: true };
}

export async function deleteCreditor(id: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  // FK on transactions.creditor_id is ON DELETE SET NULL, so attributed
  // transactions are un-assigned, not removed.
  const { error } = await supabase.from("creditors").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Repay a creditor - you paid them back. Applies the repayment across the
// person's open borrows (oldest first) as an excluded outflow linked to each
// borrow (repays_id), bumping the borrow's repaid_amount so the outstanding
// payable shrinks. Money leaves a real account, but it isn't spending (it's debt
// repayment), so it's a transfer. Covering one of their expenses instead of
// paying cash is the same movement - just describe what the money bought.
// ---------------------------------------------------------------------------
const repayCreditorSchema = z.object({
  creditor_id: z.string().uuid(),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  account_id: z.string().uuid("Pick an account."),
  txn_date: z.string().min(10).nullable().optional(),
  description: z.string().trim().nullable().optional(),
});

export type RepayInput = z.input<typeof repayCreditorSchema>;

export async function repayCreditor(input: RepayInput): Promise<ActionResult> {
  const parsed = repayCreditorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const d = parsed.data;

  const { data: creditor, error: cErr } = await supabase
    .from("creditors")
    .select("id,name")
    .eq("id", d.creditor_id)
    .eq("user_id", user.id)
    .single();
  if (cErr || !creditor) return { ok: false, error: "Creditor not found." };

  // The person's still-outstanding borrows, oldest first.
  const { data: borrows } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("creditor_id", creditor.id)
    .eq("direction", "inflow")
    .eq("is_transfer", true)
    .is("repays_id", null)
    .order("txn_date", { ascending: true });

  const open = (borrows ?? [])
    .map((b) => ({ b, out: outstandingPayable(b) }))
    .filter((x) => x.out > 0.005);
  const totalOut = round2(open.reduce((s, x) => s + x.out, 0));
  const payAmt = round2(Math.min(d.amount, totalOut));
  if (payAmt <= 0) return { ok: false, error: "Nothing left to repay." };

  const label = d.description?.trim() || null;
  const when = d.txn_date || new Date().toISOString().slice(0, 10);
  let remaining = payAmt;
  for (const { b, out } of open) {
    if (remaining <= 0.005) break;
    const take = round2(Math.min(remaining, out));

    const row: TxnInsert = {
      user_id: user.id,
      txn_date: when,
      account_id: d.account_id,
      amount: take,
      direction: "outflow",
      is_transfer: true, // debt repayment leaving your account - not spending
      creditor_id: creditor.id,
      repays_id: b.id, // link back so deleting the repayment restores the debt
      description: label || `Repaid ${creditor.name}`,
      notes: `Repaid ${take.toFixed(2)} of "${b.description}".`,
    };
    const { error: insErr } = await supabase.from("transactions").insert(row);
    if (insErr) return { ok: false, error: insErr.message };

    const newTotal = round2((b.repaid_amount ?? 0) + take);
    const { error: updErr } = await supabase
      .from("transactions")
      .update({ repaid_amount: newTotal })
      .eq("id", b.id)
      .eq("user_id", user.id);
    if (updErr) return { ok: false, error: updErr.message };

    remaining = round2(remaining - take);
  }

  revalidate();
  return { ok: true };
}
