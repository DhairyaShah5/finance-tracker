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
  notes: z.string().trim().nullable().optional(),
});

export type TransactionInput = z.input<typeof schema>;
type ActionResult = { ok: boolean; error?: string };

function normalize(data: z.output<typeof schema>) {
  // Honor the schema CHECK constraints: inflow_type only on inflows,
  // whose_expense only on outflows.
  return {
    txn_date: data.txn_date,
    account_id: data.account_id,
    category_id: data.category_id || null,
    description: data.description,
    direction: data.direction,
    amount: data.amount,
    inflow_type_id: data.direction === "inflow" ? data.inflow_type_id || null : null,
    whose_expense: data.direction === "outflow" ? data.whose_expense || "My" : null,
    debtor_id: data.debtor_id || null,
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
  for (const p of ["/transactions", "/", "/accounts", "/debtors"]) revalidatePath(p);
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
