import { requireUser } from "@/lib/queries";
import { DebtorsView } from "./debtors-view";

export const dynamic = "force-dynamic";

export default async function DebtorsPage() {
  const { supabase, user } = await requireUser();

  const [debtorsRes, accountsRes] = await Promise.all([
    supabase.from("debtors").select("*").eq("user_id", user.id).order("amount", { ascending: false }),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
  ]);

  return <DebtorsView debtors={debtorsRes.data ?? []} accounts={accountsRes.data ?? []} />;
}
