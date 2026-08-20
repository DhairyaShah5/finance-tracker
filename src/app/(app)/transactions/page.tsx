import { requireUser } from "@/lib/queries";
import { accountActivity, visibleLedger } from "@/lib/calc";
import { PageHeader } from "@/components/page-header";
import { TransactionsView } from "./transactions-view";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const { supabase, user } = await requireUser();

  const [txnsRes, accountsRes, categoriesRes, inflowRes, debtorsRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id).order("txn_date", { ascending: false }),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("categories").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("inflow_types").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("debtors").select("*").eq("user_id", user.id).order("name"),
  ]);

  // The Transactions page keeps every row (it's the raw ledger) but defaults to
  // hiding accounts you've turned off, with a reveal toggle. Compute net worth
  // both ways so the toggle can flip the numbers to match what's shown.
  const allTxns = txnsRes.data ?? [];
  const allAccounts = accountsRes.data ?? [];
  const { accounts: visAccts, txns: visTxns, hiddenIds } = visibleLedger(allAccounts, allTxns);

  // How often each category is used, so the Add-transaction picker can lead with
  // the ones logged most (Eating Out, Groceries, ...).
  const categoryCounts: Record<string, number> = {};
  for (const t of allTxns) {
    if (t.category_id) categoryCounts[t.category_id] = (categoryCounts[t.category_id] ?? 0) + 1;
  }

  const sumNetWorth = (txns: typeof allTxns, accounts: typeof allAccounts) =>
    accountActivity(txns, accounts)
      .filter((a) => a.account.include_in_net_worth)
      .reduce((s, a) => s + a.balance, 0);
  const netWorth = sumNetWorth(visTxns, visAccts);
  const netWorthAll = sumNetWorth(allTxns, allAccounts);

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description="Every dollar in and out, your full ledger." />
      <TransactionsView
        transactions={allTxns}
        netWorth={netWorth}
        netWorthAll={netWorthAll}
        hiddenAccountIds={[...hiddenIds]}
        lookups={{
          accounts: allAccounts,
          categories: categoriesRes.data ?? [],
          inflowTypes: inflowRes.data ?? [],
          debtors: debtorsRes.data ?? [],
          categoryCounts,
        }}
      />
    </div>
  );
}
