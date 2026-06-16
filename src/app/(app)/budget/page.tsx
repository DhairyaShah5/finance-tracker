import { requireUser } from "@/lib/queries";
import { monthlyBudgetStatus } from "@/lib/calc";
import { monthKey } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { BudgetView } from "./budget-view";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const { supabase, user } = await requireUser();

  const [txnsRes, catsRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("categories").select("*").eq("user_id", user.id).order("display_order"),
  ]);
  const txns = txnsRes.data ?? [];
  const categories = catsRes.data ?? [];

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - now.getDate() + 1); // includes today

  // Every month that has activity, plus the current month, oldest first.
  const months = [...new Set([...txns.map((t) => monthKey(t.txn_date)), currentMonth])].sort();
  const statuses = months.map((m) => monthlyBudgetStatus(txns, categories, m));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget"
        description="Adaptive monthly budgets that learn from your spending. Browse any month."
      />
      <BudgetView statuses={statuses} currentMonth={currentMonth} daysLeft={daysLeft} />
    </div>
  );
}
