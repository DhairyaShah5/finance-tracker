"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { myAmount } from "@/lib/calc";
import type { Database } from "@/lib/database.types";

type TxnInsert = Database["public"]["Tables"]["transactions"]["Insert"];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const schema = z.object({
  txn_date: z.string().min(10),
  account_id: z.string().uuid("Pick an account."),
  category_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1, "Description is required."),
  direction: z.enum(["outflow", "inflow"]),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  inflow_type_id: z.string().uuid().nullable().optional(),
  whose_expense: z.enum(["My", "Friend", "Group", "Roommates"]).nullable().optional(),
  debtor_id: z.string().uuid().nullable().optional(),
  is_transfer: z.boolean().optional(),
  split_count: z.coerce.number().int().positive().nullable().optional(),
  my_share: z.coerce.number().min(0, "Share can't be negative.").nullable().optional(),
  budget_group: z.enum(["needs", "wants", "savings"]).nullable().optional(),
  reimbursable: z.coerce.boolean().optional(),
  notes: z.string().trim().nullable().optional(),
});

export type TransactionInput = z.input<typeof schema>;
type ActionResult = { ok: boolean; error?: string };

function normalize(data: z.output<typeof schema>) {
  // Honor the schema CHECK constraints: inflow_type only on inflows,
  // whose_expense only on outflows. Transfers carry none of that metadata.
  const isTransfer = data.is_transfer ?? false;
  return {
    txn_date: data.txn_date,
    account_id: data.account_id,
    category_id: isTransfer ? null : data.category_id || null,
    description: data.description,
    direction: data.direction,
    amount: data.amount,
    inflow_type_id: !isTransfer && data.direction === "inflow" ? data.inflow_type_id || null : null,
    whose_expense: !isTransfer && data.direction === "outflow" ? data.whose_expense || "My" : null,
    // split_count only applies to Group/Roommates expenses.
    split_count:
      !isTransfer &&
      data.direction === "outflow" &&
      (data.whose_expense === "Group" || data.whose_expense === "Roommates")
        ? data.split_count ?? null
        : null,
    debtor_id: isTransfer ? null : data.debtor_id || null,
    is_transfer: isTransfer,
    // Explicit "your share" override; only meaningful on real outflows.
    my_share: !isTransfer && data.direction === "outflow" ? data.my_share ?? null : null,
    // needs / wants / savings is per-transaction, only on real outflows.
    budget_group: !isTransfer && data.direction === "outflow" ? data.budget_group ?? null : null,
    // Reimbursable only applies to real outflows; `reimbursed` is left untouched
    // so it survives edits (it's managed by markReimbursed, not this form).
    reimbursable: !isTransfer && data.direction === "outflow" ? (data.reimbursable ?? false) : false,
    notes: data.notes || null,
  };
}

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidate() {
  for (const p of ["/transactions", "/", "/accounts", "/debtors", "/insights", "/budget"]) revalidatePath(p);
}

export async function createTransaction(input: TransactionInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("transactions")
    .insert({ user_id: user.id, ...normalize(parsed.data) });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("transactions")
    .update(normalize(parsed.data))
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Reassign a transaction's category - used from the Insights month breakdown. */
export async function setTransactionCategory(id: string, categoryId: string | null): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Set a transaction's 50/30/20 group - used from the Insights month breakdown. */
export async function setTransactionBudgetGroup(
  id: string,
  group: "needs" | "wants" | "savings" | null,
): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase
    .from("transactions")
    .update({ budget_group: group })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Record a reimbursement against a reimbursable expense - money landed back in
// one of your accounts. Supports partial / installment reimbursements: `amount`
// is capped at what's still outstanding, added to the expense's running
// `reimbursed_amount`, and `reimbursed` flips true once it's fully paid back.
// Each reimbursement is booked as an excluded inflow (raises your balance, but is
// NOT income, since it's your own fronted money returning).
//
// If a reimbursement arrived bundled with a paycheck, log the paycheck for the
// salary portion only and use this for the reimbursement portion - the two
// inflows then add up to the real deposit.
// ---------------------------------------------------------------------------
const reimburseSchema = z.object({
  transaction_id: z.string().uuid(),
  account_id: z.string().uuid("Pick an account."),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  txn_date: z.string().min(10),
  description: z.string().trim().nullable().optional(),
});

export type ReimburseInput = z.input<typeof reimburseSchema>;

export async function markReimbursed(input: ReimburseInput): Promise<ActionResult> {
  const parsed = reimburseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const d = parsed.data;

  const { data: txn, error: tErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", d.transaction_id)
    .eq("user_id", user.id)
    .single();
  if (tErr || !txn) return { ok: false, error: "Transaction not found." };
  if (!txn.reimbursable) return { ok: false, error: "That expense isn't marked reimbursable." };

  const owed = round2(txn.amount - myAmount(txn)); // the reimbursable portion
  const already = round2(txn.reimbursed_amount ?? 0);
  const remaining = round2(owed - already);
  if (remaining <= 0) return { ok: false, error: "Already fully reimbursed." };

  const back = round2(Math.min(d.amount, remaining)); // never over-reimburse
  if (back <= 0) return { ok: false, error: "Nothing left to reimburse." };

  const row: TxnInsert = {
    user_id: user.id,
    txn_date: d.txn_date,
    account_id: d.account_id,
    amount: back,
    direction: "inflow",
    is_transfer: true, // fronted money returning - excluded from income, raises balance
    description: d.description?.trim() || `Reimbursed: ${txn.description}`,
    notes: `Reimbursement for "${txn.description}" (${back.toFixed(2)}).`,
  };
  const { error: insErr } = await supabase.from("transactions").insert(row);
  if (insErr) return { ok: false, error: insErr.message };

  const newTotal = round2(already + back);
  const { error: updErr } = await supabase
    .from("transactions")
    .update({ reimbursed_amount: newTotal, reimbursed: newTotal >= owed - 0.005 })
    .eq("id", txn.id)
    .eq("user_id", user.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidate();
  return { ok: true };
}

/** Quick toggle to (un)mark a transaction as an internal transfer. */
export async function setTransactionTransfer(id: string, isTransfer: boolean): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const patch = isTransfer
    ? { is_transfer: true, category_id: null, inflow_type_id: null, whose_expense: null, debtor_id: null }
    : { is_transfer: false };
  const { error } = await supabase.from("transactions").update(patch).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
