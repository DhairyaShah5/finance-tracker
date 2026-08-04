"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { myAmount, outstandingReceivable } from "@/lib/calc";
import type { Database } from "@/lib/database.types";

type TxnInsert = Database["public"]["Tables"]["transactions"]["Insert"];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Adding a debtor records a real fronted expense: the money left an account of
// yours, so a debtor is inseparable from the transaction that created the debt.
// Its balance is then DERIVED from that (and any other) linked expense - never
// stored - which is what keeps "owed to me" from counting the same debt twice.
const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  account_id: z.string().uuid("Pick an account."),
  txn_date: z.string().min(10),
  category_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().nullable().optional(),
});
const editSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  note: z.string().trim().nullable().optional(),
});

export type DebtorInput = z.input<typeof createSchema>;
export type DebtorEditInput = z.input<typeof editSchema>;
type ActionResult = { ok: boolean; error?: string };

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidate() {
  for (const p of ["/debtors", "/", "/accounts", "/transactions", "/insights", "/budget"]) revalidatePath(p);
}

/** Map common Postgres errors to friendly text. */
function friendlyError(message: string): string {
  if (/duplicate key|unique/i.test(message)) {
    return "A debtor with that name already exists.";
  }
  return message;
}

export async function createDebtor(input: DebtorInput): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
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
    if (cErr || !created) return { ok: false, error: friendlyError(cErr?.message ?? "Failed to add debtor.") };
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
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  // Only the label is editable now - the balance is derived from the ledger.
  const { error } = await supabase
    .from("debtors")
    .update({ name: parsed.data.name, note: parsed.data.note?.trim() || null })
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
// Settle up - a debtor paid you back. Because a debtor's balance is now derived
// from their linked reimbursable expenses, settling means applying the repayment
// across those expenses (oldest first), exactly like recording a reimbursement:
//
//   "cash"    -> they sent money to one of your accounts. Booked as an excluded
//                inflow per expense (is_transfer, linked via reimburses_id so it
//                reverses on delete): raises your balance, but isn't income, and
//                the front stops being a receivable.
//   "in_kind" -> instead of paying you, they covered one of YOUR expenses. No
//                money moved through any bank, so no inflow is written; the
//                fronted slice simply becomes your own spending (a write-off via
//                my_share), which clears it from "owed to me".
// ---------------------------------------------------------------------------
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

  // The person's still-outstanding fronted expenses, oldest first.
  const { data: expenses } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("debtor_id", debtor.id)
    .eq("direction", "outflow")
    .eq("is_transfer", false)
    .eq("reimbursable", true)
    .order("txn_date", { ascending: true });

  const open = (expenses ?? [])
    .map((e) => ({ e, out: outstandingReceivable(e) }))
    .filter((x) => x.out > 0.005);
  const totalOut = round2(open.reduce((s, x) => s + x.out, 0));
  const settleAmt = round2(Math.min(d.amount, totalOut));
  if (settleAmt <= 0) return { ok: false, error: "Nothing left to settle." };

  const label = d.description?.trim() || null;
  const when = d.txn_date || new Date().toISOString().slice(0, 10);
  let remaining = settleAmt;
  for (const { e, out } of open) {
    if (remaining <= 0.005) break;
    const take = round2(Math.min(remaining, out));
    const owed = round2(e.amount - myAmount(e));

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
      const newTotal = round2((e.reimbursed_amount ?? 0) + take);
      const { error: updErr } = await supabase
        .from("transactions")
        .update({ reimbursed_amount: newTotal, reimbursed: newTotal >= owed - 0.005 })
        .eq("id", e.id)
        .eq("user_id", user.id);
      if (updErr) return { ok: false, error: updErr.message };
    } else {
      // Paid in kind: the fronted slice becomes your own spending (write-off).
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
