import { requireUser } from "@/lib/queries";
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

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description="Every dollar in and out — your full ledger." />
      <TransactionsView
        transactions={txnsRes.data ?? []}
        lookups={{
          accounts: accountsRes.data ?? [],
          categories: categoriesRes.data ?? [],
          inflowTypes: inflowRes.data ?? [],
          debtors: debtorsRes.data ?? [],
        }}
      />
    </div>
  );
}
