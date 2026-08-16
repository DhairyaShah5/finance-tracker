import { requireUser } from "@/lib/queries";
import { accountActivity } from "@/lib/calc";
import { ReconcileView } from "./reconcile-view";

export const dynamic = "force-dynamic";

export default async function ReconcilePage() {
  const { supabase, user } = await requireUser();
  const [txnsRes, accountsRes, categoriesRes, historyRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("categories").select("id, linked_account_id").eq("user_id", user.id),
    supabase
      .from("account_reconciliations")
      .select("*")
      .eq("user_id", user.id)
      .order("as_of_date", { ascending: false }),
  ]);
  const activity = accountActivity(txnsRes.data ?? [], accountsRes.data ?? [], categoriesRes.data ?? []);
  const accounts = activity.map((a) => ({
    id: a.account.id,
    name: a.account.name,
    isCredit: a.account.is_credit,
    balance: a.balance,
    reconciledThrough: a.account.reconciled_through,
  }));
  const history = (historyRes.data ?? []).map((r) => ({
    accountId: r.account_id,
    asOf: r.as_of_date,
    statementBalance: r.statement_balance,
    difference: r.difference,
    method: r.method,
    recordedOn: r.created_at,
  }));
  return <ReconcileView accounts={accounts} history={history} />;
}
