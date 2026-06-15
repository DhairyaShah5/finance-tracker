import { requireUser } from "@/lib/queries";
import { accountActivity } from "@/lib/calc";
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

  const txns = txnsRes.data ?? [];
  const accounts = accountsRes.data ?? [];
  const netWorth = accountActivity(txns, accounts)
    .filter((a) => a.account.include_in_net_worth)
    .reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description="Every dollar in and out — your full ledger." />
      <TransactionsView
        transactions={txns}
        netWorth={netWorth}
        lookups={{
          accounts,
          categories: categoriesRes.data ?? [],
          inflowTypes: inflowRes.data ?? [],
          debtors: debtorsRes.data ?? [],
        }}
      />
    </div>
  );
}
