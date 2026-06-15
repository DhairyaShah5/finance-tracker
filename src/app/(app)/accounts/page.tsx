import { requireUser } from "@/lib/queries";
import { accountActivity } from "@/lib/calc";
import { AccountsView } from "./accounts-view";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const { supabase, user } = await requireUser();

  const [settingsRes, txnsRes, accountsRes] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", user.id).single(),
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
  ]);

  // settings is fetched per the data contract (single row); not needed for the
  // account-balance computation, which uses each account's opening_balance.
  void settingsRes;

  const txns = txnsRes.data ?? [];
  const accounts = accountsRes.data ?? [];

  const activity = accountActivity(txns, accounts);

  return <AccountsView activity={activity} />;
}
