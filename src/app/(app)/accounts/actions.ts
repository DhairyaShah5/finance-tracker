"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ACCOUNT_TYPES } from "@/lib/defaults";

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

/** Σ signed (inflow +, outflow −) over all of an account's transactions. */
async function deltaFor(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string,
): Promise<number> {
  const { data } = await supabase
    .from("transactions")
    .select("direction, amount")
    .eq("user_id", userId)
    .eq("account_id", accountId);
  return (data ?? []).reduce((s, t) => s + (t.direction === "inflow" ? t.amount : -t.amount), 0);
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
  const delta = await deltaFor(supabase, user.id, id);
  const { error } = await supabase
    .from("accounts")
    .update({
      name: d.name,
      bank: d.bank?.trim() || "Other",
      type: d.type,
      is_credit: d.type === "credit_card",
      // Back-solve so the displayed (opening + activity) equals the desired balance.
      opening_balance: round2(d.balance - delta),
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
 * `to`, both flagged is_transfer so they update balances but never count as
 * income or spending. Paying a credit card => from = checking, to = card: the
 * card's negative (owed) balance rises toward 0 while checking drops. A card
 * with a positive (credit) balance is settled the other way (from = card).
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
    .select("id, name")
    .eq("user_id", user.id)
    .in("id", [d.from_account_id, d.to_account_id]);
  const nameOf = (id: string) => accts?.find((a) => a.id === id)?.name ?? "account";
  const note = d.note?.trim() || null;

  const { error } = await supabase.from("transactions").insert([
    {
      user_id: user.id,
      txn_date: d.date,
      account_id: d.from_account_id,
      description: note ?? `Transfer to ${nameOf(d.to_account_id)}`,
      direction: "outflow",
      amount: round2(d.amount),
      is_transfer: true,
    },
    {
      user_id: user.id,
      txn_date: d.date,
      account_id: d.to_account_id,
      description: note ?? `Transfer from ${nameOf(d.from_account_id)}`,
      direction: "inflow",
      amount: round2(d.amount),
      is_transfer: true,
    },
  ]);
  if (error) return { ok: false, error: error.message };
  for (const p of ["/accounts", "/", "/transactions", "/insights"]) revalidatePath(p);
  return { ok: true };
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
