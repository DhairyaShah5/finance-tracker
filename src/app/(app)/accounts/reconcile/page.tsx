import { requireUser } from "@/lib/queries";
import { accountActivity } from "@/lib/calc";
import { ReconcileView } from "./reconcile-view";

export const dynamic = "force-dynamic";

export default async function ReconcilePage() {
  const { supabase, user } = await requireUser();
  const [txnsRes, accountsRes, categoriesRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("categories").select("id, linked_account_id").eq("user_id", user.id),
  ]);
  const activity = accountActivity(txnsRes.data ?? [], accountsRes.data ?? [], categoriesRes.data ?? []);
  const accounts = activity.map((a) => ({
    id: a.account.id,
    name: a.account.name,
    isCredit: a.account.is_credit,
    balance: a.balance,
    reconciledThrough: a.account.reconciled_through,
  }));
  return <ReconcileView accounts={accounts} />;
}
