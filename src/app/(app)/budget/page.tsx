import { requireUser } from "@/lib/queries";
import { monthlyBudgetStatus } from "@/lib/calc";
import { PageHeader } from "@/components/page-header";
import { BudgetView } from "./budget-view";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const { supabase, user } = await requireUser();

  const [txnsRes, catsRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("categories").select("*").eq("user_id", user.id).order("display_order"),
  ]);

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - now.getDate() + 1); // includes today

  const status = monthlyBudgetStatus(txnsRes.data ?? [], catsRes.data ?? [], month);

  return (
    <div className="space-y-6">
      <PageHeader title="Budget" description="What is left to spend this month, by category." />
      <BudgetView status={status} daysLeft={daysLeft} />
    </div>
  );
}
