"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { myAmount, splitShares } from "@/lib/calc";
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
  // A brand-new person's name, typed on a Friend expense - we create the debtor
  // and link it, so a Friend expense always lands under someone on Debtors.
  debtor_name: z.string().trim().nullable().optional(),
  // Split across several people (Friend / Group / Roommates). Each entry is one
  // person who owes you a slice of this bill: an existing debtor (`id`) or a new
  // one typed inline (`name`, found-or-created). `share` fixes that person's
  // amount; null means "take an even share of the rest". When present and
  // non-empty this drives a transaction_debtors junction and supersedes the
  // single `debtor_id` above.
  people: z
    .array(
      z.object({
        id: z.string().uuid().nullable().optional(),
        name: z.string().trim().nullable().optional(),
        share: z.coerce.number().min(0, "Share can't be negative.").nullable().optional(),
      }),
    )
    .optional(),
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
    // so it survives edits (it's managed by markReimbursed, not this form). A
    // Friend expense is money fronted entirely for someone else, so it's ALWAYS
    // a receivable - that's what makes it show up (once) as owed on Debtors.
    reimbursable:
      !isTransfer && data.direction === "outflow"
        ? data.whose_expense === "Friend" || (data.reimbursable ?? false)
        : false,
    notes: data.notes || null,
  };
}

/**
 * A Friend expense must attach to a person. If the form passed a `debtor_name`
 * (a new person typed inline) instead of an existing `debtor_id`, find-or-create
 * that debtor for this user and return its id so the transaction can link to it.
 */
async function resolveDebtorId(
  supabase: Awaited<ReturnType<typeof authed>>["supabase"],
  userId: string,
  data: z.output<typeof schema>,
): Promise<string | null> {
  // Verify a passed debtor_id actually belongs to this user before linking to it
  // (don't trust a client-supplied id and attach a transaction to someone else's
  // debtor). RLS also blocks reading it, so an unowned id resolves to null.
  if (data.debtor_id) {
    const { data: owned } = await supabase
      .from("debtors")
      .select("id")
      .eq("id", data.debtor_id)
      .eq("user_id", userId)
      .maybeSingle();
    return owned?.id ?? null;
  }
  const name = data.debtor_name?.trim();
  if (!name || data.whose_expense !== "Friend") return null;
  const { data: existing } = await supabase
    .from("debtors")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", name)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data: created } = await supabase
    .from("debtors")
    .insert({ user_id: userId, name, amount: 0 })
    .select("id")
    .single();
  return created?.id ?? null;
}

/** A split is only meaningful on a real (non-transfer) outflow shared with people. */
function isSplitExpense(data: z.output<typeof schema>): boolean {
  return (
    !data.is_transfer &&
    data.direction === "outflow" &&
    (data.whose_expense === "Friend" ||
      data.whose_expense === "Group" ||
      data.whose_expense === "Roommates")
  );
}

/**
 * Turn the form's `people` list into resolved debtors (find-or-create each by
 * name, or verify an existing id belongs to this user), keeping each person's
 * `share` override. Deduped by debtor id. Empty unless this is a split expense.
 */
async function resolvePeople(
  supabase: Awaited<ReturnType<typeof authed>>["supabase"],
  userId: string,
  data: z.output<typeof schema>,
): Promise<{ debtorId: string; share: number | null }[]> {
  if (!data.people || data.people.length === 0 || !isSplitExpense(data)) return [];
  const out: { debtorId: string; share: number | null }[] = [];
  const seen = new Set<string>();
  for (const p of data.people) {
    let id: string | null = p.id ?? null;
    if (id) {
      const { data: owned } = await supabase
        .from("debtors")
        .select("id")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      id = owned?.id ?? null;
    } else if (p.name?.trim()) {
      const name = p.name.trim();
      const { data: existing } = await supabase
        .from("debtors")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", name)
        .maybeSingle();
      id = existing?.id ?? null;
      if (!id) {
        const { data: created } = await supabase
          .from("debtors")
          .insert({ user_id: userId, name, amount: 0 })
          .select("id")
          .single();
        id = created?.id ?? null;
      }
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ debtorId: id, share: p.share ?? null });
  }
  return out;
}

/**
 * Split the bill across you + the people. Friend = fronted entirely, so your
 * share is 0 and the whole amount splits across the people; Group/Roommates puts
 * you in the split too (your override is the form's `my_share`). Even by default,
 * with any per-person override honored; shares always reconcile to the cent.
 */
function computeSplit(
  data: z.output<typeof schema>,
  people: { debtorId: string; share: number | null }[],
): { myShare: number; partyCount: number; rows: { debtor_id: string; share: number }[] } {
  const isFriend = data.whose_expense === "Friend";
  const overrides = isFriend
    ? people.map((p) => p.share)
    : [data.my_share ?? null, ...people.map((p) => p.share)];
  const shares = splitShares(data.amount, overrides);
  const myShare = isFriend ? 0 : shares[0];
  const personShares = isFriend ? shares : shares.slice(1);
  const rows = people.map((p, i) => ({ debtor_id: p.debtorId, share: personShares[i] ?? 0 }));
  return { myShare: round2(myShare), partyCount: isFriend ? people.length : people.length + 1, rows };
}

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidate() {
  for (const p of ["/transactions", "/", "/accounts", "/people", "/insights", "/budget"]) revalidatePath(p);
}

/** The transaction fields that a multi-person split overrides on top of normalize(). */
function splitTxnFields(
  data: z.output<typeof schema>,
  myShare: number,
  partyCount: number,
) {
  const isFriend = data.whose_expense === "Friend";
  return {
    debtor_id: null, // the junction owns the attribution now
    my_share: myShare, // your slice - keeps myAmount() authoritative everywhere
    reimbursable: true, // the others' slices are a receivable until they pay you
    reimbursed: false,
    reimbursed_amount: 0,
    // Group/Roommates track how many ways it's split; Friend leaves it null.
    split_count: isFriend ? null : partyCount,
  };
}

export async function createTransaction(input: TransactionInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const people = await resolvePeople(supabase, user.id, parsed.data);

  // Split across several people: write the expense, then one junction row each.
  if (people.length > 0) {
    const { myShare, partyCount, rows } = computeSplit(parsed.data, people);
    const { data: created, error } = await supabase
      .from("transactions")
      .insert({ user_id: user.id, ...normalize(parsed.data), ...splitTxnFields(parsed.data, myShare, partyCount) })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: error?.message ?? "Failed to save." };
    const linkRows = rows.map((r) => ({
      user_id: user.id,
      transaction_id: created.id,
      debtor_id: r.debtor_id,
      share: r.share,
      settled_amount: 0,
    }));
    const { error: lErr } = await supabase.from("transaction_debtors").insert(linkRows);
    if (lErr) return { ok: false, error: lErr.message };
    revalidate();
    return { ok: true };
  }

  const debtorId = await resolveDebtorId(supabase, user.id, parsed.data);
  const { error } = await supabase
    .from("transactions")
    .insert({ user_id: user.id, ...normalize(parsed.data), debtor_id: debtorId });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const people = await resolvePeople(supabase, user.id, parsed.data);
  const { data: existingLinks } = await supabase
    .from("transaction_debtors")
    .select("*")
    .eq("transaction_id", id)
    .eq("user_id", user.id);
  const hadLinks = (existingLinks ?? []).length > 0;
  // Any repayment already recorded against this split? Then its people/amount are
  // locked (rewriting rows would silently drop the settled history and desync the
  // receivable). Metadata-only edits are still fine as long as the split is unchanged.
  const settled = (existingLinks ?? []).some((l) => (l.settled_amount ?? 0) > 0.005);

  if (people.length > 0) {
    const { myShare, partyCount, rows } = computeSplit(parsed.data, people);
    if (settled) {
      // Compare the incoming split to what's stored; block a real change, allow the rest.
      const before = new Map((existingLinks ?? []).map((l) => [l.debtor_id, round2(l.share)]));
      const same =
        before.size === rows.length && rows.every((r) => Math.abs((before.get(r.debtor_id) ?? -1) - r.share) < 0.005);
      if (!same) {
        return {
          ok: false,
          error: "This split has repayments recorded. Delete the repayment(s) on the People page before changing who's involved or the amounts.",
        };
      }
      // Unchanged split - update only the safe fields, leave the split & totals intact.
      const n = normalize(parsed.data);
      const { error } = await supabase
        .from("transactions")
        .update({
          txn_date: n.txn_date,
          account_id: n.account_id,
          description: n.description,
          category_id: n.category_id,
          budget_group: n.budget_group,
          notes: n.notes,
        })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) return { ok: false, error: error.message };
      revalidate();
      return { ok: true };
    }
    // No repayments yet: rebuild the split from scratch.
    await supabase.from("transaction_debtors").delete().eq("transaction_id", id).eq("user_id", user.id);
    const { error } = await supabase
      .from("transactions")
      .update({ ...normalize(parsed.data), ...splitTxnFields(parsed.data, myShare, partyCount) })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
    const linkRows = rows.map((r) => ({
      user_id: user.id,
      transaction_id: id,
      debtor_id: r.debtor_id,
      share: r.share,
      settled_amount: 0,
    }));
    const { error: lErr } = await supabase.from("transaction_debtors").insert(linkRows);
    if (lErr) return { ok: false, error: lErr.message };
    revalidate();
    return { ok: true };
  }

  // No people now. If it used to be a split, tear the junction down first.
  if (hadLinks) {
    if (settled) {
      return {
        ok: false,
        error: "This split has repayments recorded. Delete the repayment(s) on the People page before removing the split.",
      };
    }
    await supabase.from("transaction_debtors").delete().eq("transaction_id", id).eq("user_id", user.id);
  }

  const debtorId = await resolveDebtorId(supabase, user.id, parsed.data);
  const { error } = await supabase
    .from("transactions")
    .update({
      ...normalize(parsed.data),
      debtor_id: debtorId,
      // Clear any split leftovers when the row is no longer a multi-person split.
      ...(hadLinks ? { reimbursed_amount: 0 } : {}),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  await syncCreditorBorrow(supabase, user.id, id);
  revalidate();
  return { ok: true };
}

/**
 * Keep a "friend paid for me" expense and its offsetting borrow in lockstep. The
 * expense is what you consumed; the borrow is what you owe - for a friend-paid
 * item they're the same thing, so editing the expense (amount, date, account)
 * must move the borrow too. Otherwise the two halves drift apart, the pair stops
 * cancelling on the account, and you end up owing more than you consumed.
 */
async function syncCreditorBorrow(
  supabase: Awaited<ReturnType<typeof authed>>["supabase"],
  userId: string,
  txnId: string,
): Promise<void> {
  const { data: exp } = await supabase
    .from("transactions")
    .select("amount, txn_date, account_id, description, creditor_id, repays_id, is_transfer")
    .eq("id", txnId)
    .eq("user_id", userId)
    .single();
  if (!exp || exp.is_transfer || !exp.creditor_id || !exp.repays_id) return;
  await supabase
    .from("transactions")
    .update({
      amount: exp.amount,
      txn_date: exp.txn_date,
      account_id: exp.account_id,
      description: exp.description,
    })
    .eq("id", exp.repays_id)
    .eq("user_id", userId);
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  // If this is a reimbursement inflow or a creditor repayment, grab its links +
  // amount first so we can roll back the parent's running total after it's gone.
  const { data: row } = await supabase
    .from("transactions")
    .select("amount, reimburses_id, repays_id, is_transfer, debtor_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  if (row?.reimburses_id) {
    // This inflow was linked to a parent expense - reverse whichever effect it had.
    const { data: parent } = await supabase
      .from("transactions")
      .select("amount, whose_expense, split_count, my_share, reimbursable, direction, is_transfer, reimbursed_amount")
      .eq("id", row.reimburses_id)
      .eq("user_id", user.id)
      .single();
    if (parent) {
      if (parent.reimbursable) {
        // Reimbursement: return the money to "still owed" - subtract it from the
        // expense's reimbursed_amount and clear the fully-paid flag.
        const owed = round2(parent.amount - myAmount(parent));
        const newTotal = round2(Math.max(0, (parent.reimbursed_amount ?? 0) - row.amount));
        await supabase
          .from("transactions")
          .update({ reimbursed_amount: newTotal, reimbursed: newTotal >= owed - 0.005 })
          .eq("id", row.reimburses_id)
          .eq("user_id", user.id);
        // If this repayment belonged to a per-person split, un-settle that
        // person's slice too, so their balance on People comes back.
        if (row.debtor_id) {
          const { data: link } = await supabase
            .from("transaction_debtors")
            .select("id, settled_amount")
            .eq("transaction_id", row.reimburses_id)
            .eq("debtor_id", row.debtor_id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (link) {
            await supabase
              .from("transaction_debtors")
              .update({ settled_amount: round2(Math.max(0, (link.settled_amount ?? 0) - row.amount)) })
              .eq("id", link.id)
              .eq("user_id", user.id);
          }
        }
      } else {
        // Split settlement: it lowered your share of the expense by its amount, so
        // deleting it restores that share (keeps the ledger reconciled).
        const restored = round2(Math.min(parent.amount, myAmount(parent) + row.amount));
        await supabase
          .from("transactions")
          .update({ my_share: restored })
          .eq("id", row.reimburses_id)
          .eq("user_id", user.id);
      }
    }
  }

  // Creditor repayment: a repayment is an is_transfer outflow linked to a borrow
  // via repays_id. Deleting it restores the debt - subtract it back off the
  // borrow's repaid_amount. (The "they paid for me" expense also carries
  // repays_id but isn't a transfer, so it never touched repaid_amount; skip it.)
  if (row?.repays_id && row.is_transfer) {
    const { data: borrow } = await supabase
      .from("transactions")
      .select("repaid_amount")
      .eq("id", row.repays_id)
      .eq("user_id", user.id)
      .single();
    if (borrow) {
      const newTotal = round2(Math.max(0, (borrow.repaid_amount ?? 0) - row.amount));
      await supabase
        .from("transactions")
        .update({ repaid_amount: newTotal })
        .eq("id", row.repays_id)
        .eq("user_id", user.id);
    }
  }

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
    reimburses_id: txn.id, // link back to the expense, so deleting this reverses it
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

// ---------------------------------------------------------------------------
// Write off the un-returned remainder of a reimbursable expense. Use this when a
// reimbursement came back only partly and the rest never will (e.g. you got $10
// of an $11.52 bill back). The outstanding slice stops being a receivable and
// becomes your own spending, so "owed to me" drops to zero and the books balance.
// Implemented by pinning `my_share` to your real out-of-pocket cost (existing
// share + the written-off remainder) and flipping `reimbursed` closed.
// ---------------------------------------------------------------------------
export async function settleReimbursement(id: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: txn, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !txn) return { ok: false, error: "Transaction not found." };
  if (!txn.reimbursable) return { ok: false, error: "That expense isn't marked reimbursable." };

  const owed = round2(txn.amount - myAmount(txn));
  const already = round2(txn.reimbursed_amount ?? 0);
  const outstanding = round2(Math.max(0, owed - already));
  if (outstanding <= 0) return { ok: false, error: "Nothing left to write off." };

  // Whatever won't come back is money you actually spent.
  const newMyShare = round2(myAmount(txn) + outstanding);
  const { error: updErr } = await supabase
    .from("transactions")
    .update({ my_share: newMyShare, reimbursed: true })
    .eq("id", id)
    .eq("user_id", user.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidate();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settle a split - someone paid you back their share of an expense you fronted
// (typically settling up on Splitwise). Records the money landing in one of your
// accounts as an EXCLUDED inflow (raises your balance, but is NOT income) AND
// lowers your share of the expense by the same amount, so your spending reflects
// only your true portion. Reducing consumption by $X while balance rises by $X
// keeps the reconciliation identity balanced. The inflow links back to the
// expense (reimburses_id) so deleting it restores the share (see deleteTransaction).
// ---------------------------------------------------------------------------
const settleSplitSchema = z.object({
  transaction_id: z.string().uuid(),
  account_id: z.string().uuid("Pick an account."),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  txn_date: z.string().min(10),
  description: z.string().trim().nullable().optional(),
});

export type SettleSplitInput = z.input<typeof settleSplitSchema>;

export async function settleSplit(input: SettleSplitInput): Promise<ActionResult> {
  const parsed = settleSplitSchema.safeParse(input);
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
  if (txn.is_transfer || txn.direction !== "outflow")
    return { ok: false, error: "You can only settle a split on an expense." };
  if (txn.reimbursable)
    return { ok: false, error: "That expense is reimbursable - use Record reimbursement instead." };

  const share = myAmount(txn); // what currently counts as your spending
  if (share <= 0) return { ok: false, error: "This expense isn't counted as your spending." };

  const back = round2(d.amount);
  if (back <= 0) return { ok: false, error: "Enter an amount to settle." };
  if (back > share + 0.005)
    return {
      ok: false,
      error: `You can settle at most ${share.toFixed(2)} here - your current share. Anything beyond that is fronted money, not part of your share.`,
    };

  // Record the money arriving - excluded from income, raises your balance.
  const row: TxnInsert = {
    user_id: user.id,
    txn_date: d.txn_date,
    account_id: d.account_id,
    amount: back,
    direction: "inflow",
    is_transfer: true,
    description: d.description?.trim() || `Split settled: ${txn.description}`,
    reimburses_id: txn.id, // link back so deleting this restores your share
    notes: `Split settlement for "${txn.description}" (${back.toFixed(2)}). Your share reduced accordingly.`,
  };
  const { error: insErr } = await supabase.from("transactions").insert(row);
  if (insErr) return { ok: false, error: insErr.message };

  // Lower your share by the recovered amount - consumption drops by exactly `back`,
  // matching the inflow, so the reconciliation stays balanced.
  const newMyShare = round2(Math.max(0, share - back));
  const { error: updErr } = await supabase
    .from("transactions")
    .update({ my_share: newMyShare })
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
