import { requireUser } from "@/lib/queries";
import { monthlyBudgetStatus, incomeByMonth, visibleLedger } from "@/lib/calc";
import { monthKey } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { BudgetView } from "./budget-view";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const { supabase, user } = await requireUser();

  const [txnsRes, catsRes, settingsRes, accountsRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("categories").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("settings").select("starting_funds, budget_months, savings_target").eq("user_id", user.id).single(),
    supabase.from("accounts").select("*").eq("user_id", user.id),
  ]);
  // Transactions on hidden accounts are excluded from every budget figure.
  const { txns } = visibleLedger(accountsRes.data ?? [], txnsRes.data ?? []);
  const categories = catsRes.data ?? [];
  const settings = settingsRes.data ?? { starting_funds: 0, budget_months: 12, savings_target: 0 };

  const runwayFloor = settings.budget_months > 0 ? settings.starting_funds / settings.budget_months : 0;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - now.getDate() + 1); // includes today

  // Every month that has activity, plus the current month, oldest first.
  const months = [...new Set([...txns.map((t) => monthKey(t.txn_date)), currentMonth])].sort();
  const statuses = months.map((m) =>
    monthlyBudgetStatus(
      txns,
      categories,
      m,
      m === currentMonth ? now.getDate() : undefined,
      runwayFloor,
    ),
  );

  // Actual earned income per month (excludes arrival capital & refunds), so the
  // budget trend can show income alongside budget vs spent. Map isn't
  // serializable across the server/client boundary, so hand over a plain object.
  const earnedByMonth = Object.fromEntries(incomeByMonth(txns));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget"
        description="Based on what you typically spend each month, plus a little headroom. Browse any month."
      />
      <BudgetView
        statuses={statuses}
        currentMonth={currentMonth}
        daysLeft={daysLeft}
        earnedByMonth={earnedByMonth}
      />
    </div>
  );
}
