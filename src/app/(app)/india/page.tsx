import { requireUser } from "@/lib/queries";
import { accountActivity } from "@/lib/calc";
import { IndiaView } from "./india-view";

export const dynamic = "force-dynamic";

export default async function IndiaPage() {
  const { supabase, user } = await requireUser();

  const [transfersRes, txnsRes, accountsRes, categoriesRes] = await Promise.all([
    supabase
      .from("india_transfers")
      .select("*")
      .eq("user_id", user.id)
      .order("transfer_date", { ascending: true }),
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("categories").select("id, linked_account_id").eq("user_id", user.id),
  ]);

  // "US net worth" here mirrors the Accounts page **Assets** tile exactly: the
  // sum of every account carrying a positive balance (cash, checking, savings -
  // excluded accounts like Marcus HYSA included). We pass it to the India view
  // so it can compute an all-in net worth once the India debt is netted out.
  const activity = accountActivity(txnsRes.data ?? [], accountsRes.data ?? [], categoriesRes.data ?? []);
  const usAssets = activity.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);

  return <IndiaView transfers={transfersRes.data ?? []} usAssets={usAssets} />;
}
