"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  for (const p of ["/transactions", "/", "/accounts", "/debtors", "/insights"]) revalidatePath(p);
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

/** Reassign a transaction's category — used from the Insights month breakdown. */
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
