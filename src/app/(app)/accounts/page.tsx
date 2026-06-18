import { requireUser } from "@/lib/queries";
import { accountActivity } from "@/lib/calc";
import { AccountsView } from "./accounts-view";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const { supabase, user } = await requireUser();

  const [txnsRes, accountsRes, categoriesRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("categories").select("id, linked_account_id").eq("user_id", user.id),
  ]);

  const activity = accountActivity(txnsRes.data ?? [], accountsRes.data ?? [], categoriesRes.data ?? []);

  return <AccountsView activity={activity} />;
}
