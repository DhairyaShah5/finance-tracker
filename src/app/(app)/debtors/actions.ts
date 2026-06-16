"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type TxnInsert = Database["public"]["Tables"]["transactions"]["Insert"];

const schema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  amount: z.coerce.number().min(0, "Amount can't be negative."),
  note: z.string().trim().nullable().optional(),
});

export type DebtorInput = z.input<typeof schema>;
type ActionResult = { ok: boolean; error?: string };

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidate() {
  for (const p of ["/debtors", "/"]) revalidatePath(p);
}

function normalize(data: z.output<typeof schema>) {
  return {
    name: data.name,
    amount: data.amount,
    note: data.note?.trim() ? data.note.trim() : null,
  };
}

/** Map common Postgres errors to friendly text. */
function friendlyError(message: string): string {
  if (/duplicate key|unique/i.test(message)) {
    return "A debtor with that name already exists.";
  }
  return message;
}

export async function createDebtor(input: DebtorInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("debtors")
    .insert({ user_id: user.id, ...normalize(parsed.data) });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidate();
  return { ok: true };
}

export async function updateDebtor(id: string, input: DebtorInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("debtors")
    .update(normalize(parsed.data))
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: friendlyError(error.message) };
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
// Settle up - record that a debtor paid you back, and lower their balance.
//
//   "cash"    -> they sent money to one of your accounts. Recorded as an
//                excluded inflow (is_transfer): it raises your balance / net
//                worth but isn't income (it's fronted money coming back), and
//                it removes the unrecovered front from `spending`.
//   "in_kind" -> instead of paying you, they covered one of YOUR expenses. No
//                money moved through any of your banks, so NO transaction is
//                created - we just clear the debt. The original front you made
//                already reduced your balance / spending when it happened, so
//                nothing else needs to move.
// ---------------------------------------------------------------------------
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const settleSchema = z.object({
  debtor_id: z.string().uuid(),
  mode: z.enum(["cash", "in_kind"]),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  // Only used (and required) for cash repayments, which actually hit an account.
  account_id: z.string().uuid().nullable().optional(),
  txn_date: z.string().min(10).nullable().optional(),
  description: z.string().trim().nullable().optional(),
});

export type SettleInput = z.input<typeof settleSchema>;

export async function settleDebtor(input: SettleInput): Promise<ActionResult> {
  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const d = parsed.data;

  const { data: debtor, error: dErr } = await supabase
    .from("debtors")
    .select("id,name,amount")
    .eq("id", d.debtor_id)
    .eq("user_id", user.id)
    .single();
  if (dErr || !debtor) return { ok: false, error: "Debtor not found." };

  const owed = round2(debtor.amount ?? 0);
  const settleAmt = round2(Math.min(d.amount, owed));
  if (settleAmt <= 0) return { ok: false, error: "Nothing left to settle." };

  // Only a cash repayment touches an account. "Paid for me" moves no money
  // through your bank, so it just clears the debt - no transaction is written.
  if (d.mode === "cash") {
    if (!d.account_id) return { ok: false, error: "Pick an account for the cash repayment." };
    const label = d.description?.trim() || null;
    const row: TxnInsert = {
      user_id: user.id,
      txn_date: d.txn_date || new Date().toISOString().slice(0, 10),
      account_id: d.account_id,
      amount: settleAmt,
      direction: "inflow",
      is_transfer: true, // returns fronted money - excluded from income, raises balance
      debtor_id: debtor.id,
      description: label || `${debtor.name} repaid`,
      notes: `Settled ${settleAmt.toFixed(2)} of ${debtor.name}'s balance (cash repayment).`,
    };
    const { error: insErr } = await supabase.from("transactions").insert(row);
    if (insErr) return { ok: false, error: insErr.message };
  }

  const { error: updErr } = await supabase
    .from("debtors")
    .update({ amount: round2(owed - settleAmt) })
    .eq("id", debtor.id)
    .eq("user_id", user.id);
  if (updErr) return { ok: false, error: updErr.message };

  for (const p of ["/debtors", "/", "/accounts", "/transactions", "/insights", "/budget"]) revalidatePath(p);
  return { ok: true };
}
