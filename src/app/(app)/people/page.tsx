import { requireUser } from "@/lib/queries";
import {
  debtorBalances,
  creditorBalances,
  visibleLedger,
  outstandingReceivable,
  outstandingPayable,
} from "@/lib/calc";
import { PeopleView } from "./people-view";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const { supabase, user } = await requireUser();

  const [debtorsRes, creditorsRes, accountsRes, txnsRes, categoriesRes, linksRes] = await Promise.all([
    supabase.from("debtors").select("*").eq("user_id", user.id),
    supabase.from("creditors").select("*").eq("user_id", user.id),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("categories").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("transaction_debtors").select("*").eq("user_id", user.id),
  ]);

  // Hidden accounts drop out: money fronted or borrowed on one no longer counts,
  // and the account isn't offered when settling up.
  const { accounts, txns } = visibleLedger(accountsRes.data ?? [], txnsRes.data ?? [], categoriesRes.data ?? []);
  // Per-person split slices, but only for transactions that survived the hidden-
  // account filter (a slice of an expense on a hidden account shouldn't count).
  const visibleTxnIds = new Set(txns.map((t) => t.id));
  const links = (linksRes.data ?? []).filter((l) => visibleTxnIds.has(l.transaction_id));

  // Balances are derived from the ledger, largest first (matching the old order).
  const debtors = debtorBalances(txns, debtorsRes.data ?? [], links).sort((a, b) => b.outstanding - a.outstanding);
  const creditors = creditorBalances(txns, creditorsRes.data ?? []).sort((a, b) => b.outstanding - a.outstanding);

  // A live note for each person, derived from what they currently owe (or you owe
  // them) - the descriptions of their still-open items, newest first. This keeps
  // the note honest instead of frozen at whatever it was when they were added.
  const debtorById = new Map((debtorsRes.data ?? []).map((d) => [d.id, d.name]));
  const creditorById = new Map((creditorsRes.data ?? []).map((c) => [c.id, c.name]));
  const txnById = new Map(txns.map((t) => [t.id, t]));
  const openItems: { name: string; desc: string; date: string }[] = [];
  for (const t of txns) {
    if (t.debtor_id && outstandingReceivable(t) > 0.005) {
      const name = debtorById.get(t.debtor_id);
      if (name) openItems.push({ name, desc: t.description, date: t.txn_date });
    }
    if (t.creditor_id && outstandingPayable(t) > 0.005) {
      const name = creditorById.get(t.creditor_id);
      if (name) openItems.push({ name, desc: t.description, date: t.txn_date });
    }
  }
  for (const l of links) {
    if (l.share - l.settled_amount <= 0.005) continue;
    const t = txnById.get(l.transaction_id);
    const name = debtorById.get(l.debtor_id);
    if (t && name) openItems.push({ name, desc: t.description, date: t.txn_date });
  }
  const byName = new Map<string, { desc: string; date: string }[]>();
  for (const it of openItems) {
    const key = it.name.trim().toLowerCase();
    const arr = byName.get(key);
    if (arr) arr.push(it);
    else byName.set(key, [it]);
  }
  const derivedNotes: Record<string, string> = {};
  for (const [key, list] of byName) {
    list.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
    const descs = [...new Set(list.map((i) => i.desc))];
    derivedNotes[key] = descs.length > 1 ? `${descs[0]} +${descs.length - 1} more` : descs[0];
  }

  return (
    <PeopleView
      debtorBalances={debtors}
      creditorBalances={creditors}
      derivedNotes={derivedNotes}
      accounts={accounts}
      categories={categoriesRes.data ?? []}
    />
  );
}
