import { requireUser } from "@/lib/queries";
import { DebtorsView } from "./debtors-view";

export const dynamic = "force-dynamic";

export default async function DebtorsPage() {
  const { supabase, user } = await requireUser();

  const { data: debtors } = await supabase
    .from("debtors")
    .select("*")
    .eq("user_id", user.id)
    .order("amount", { ascending: false });

  return <DebtorsView debtors={debtors ?? []} />;
}
