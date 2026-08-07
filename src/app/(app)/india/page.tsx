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

  // "US net worth" is the sum of EVERY account balance (savings and investments
  // included, credit-card debt subtracted) - identical to the figure the Yearly
  // Journey page uses, so the two pages agree to the cent. The India debt is
  // netted against it in the view.
  const activity = accountActivity(txnsRes.data ?? [], accountsRes.data ?? [], categoriesRes.data ?? []);
  const usNetWorth = activity.reduce((s, a) => s + a.balance, 0);

  return <IndiaView transfers={transfersRes.data ?? []} usNetWorth={usNetWorth} />;
}
