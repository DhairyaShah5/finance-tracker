import { requireUser } from "@/lib/queries";
import { debtorBalances, creditorBalances, visibleLedger } from "@/lib/calc";
import { PeopleView } from "./people-view";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const { supabase, user } = await requireUser();

  const [debtorsRes, creditorsRes, accountsRes, txnsRes, categoriesRes] = await Promise.all([
    supabase.from("debtors").select("*").eq("user_id", user.id),
    supabase.from("creditors").select("*").eq("user_id", user.id),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("categories").select("*").eq("user_id", user.id).order("display_order"),
  ]);

  // Hidden accounts drop out: money fronted or borrowed on one no longer counts,
  // and the account isn't offered when settling up.
  const { accounts, txns } = visibleLedger(accountsRes.data ?? [], txnsRes.data ?? [], categoriesRes.data ?? []);

  // Balances are derived from the ledger, largest first (matching the old order).
  const debtors = debtorBalances(txns, debtorsRes.data ?? []).sort((a, b) => b.outstanding - a.outstanding);
  const creditors = creditorBalances(txns, creditorsRes.data ?? []).sort((a, b) => b.outstanding - a.outstanding);

  return (
    <PeopleView
      debtorBalances={debtors}
      creditorBalances={creditors}
      accounts={accounts}
      categories={categoriesRes.data ?? []}
    />
  );
}
