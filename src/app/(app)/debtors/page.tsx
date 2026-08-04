import { requireUser } from "@/lib/queries";
import { debtorBalances } from "@/lib/calc";
import { DebtorsView } from "./debtors-view";

export const dynamic = "force-dynamic";

export default async function DebtorsPage() {
  const { supabase, user } = await requireUser();

  const [debtorsRes, accountsRes, txnsRes, categoriesRes] = await Promise.all([
    supabase.from("debtors").select("*").eq("user_id", user.id),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("categories").select("*").eq("user_id", user.id).order("display_order"),
  ]);

  // Balances are derived from the ledger, then sorted with the largest debts on
  // top (matching the old amount-desc order).
  const balances = debtorBalances(txnsRes.data ?? [], debtorsRes.data ?? []).sort(
    (a, b) => b.outstanding - a.outstanding,
  );

  return (
    <DebtorsView
      balances={balances}
      accounts={accountsRes.data ?? []}
      categories={categoriesRes.data ?? []}
    />
  );
}
