import { requireUser } from "@/lib/queries";
import { budgetGroupsByMonth, incomeByMonth, myAmount } from "@/lib/calc";
import { fmtMoney, fmtPct, monthKey } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarSeriesChart } from "@/components/charts";
import { MonthlyBreakdown, type DetailItem, type Group } from "./monthly-breakdown";

export const dynamic = "force-dynamic";

const COLORS = { needs: "var(--chart-1)", wants: "var(--chart-5)", savings: "var(--chart-2)" };
const TARGET = { needs: 0.5, wants: 0.3, savings: 0.2 };

export default async function InsightsPage() {
  const { supabase, user } = await requireUser();

  const [txnsRes, categoriesRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id),
    supabase.from("categories").select("*").eq("user_id", user.id),
  ]);
  const txns = txnsRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  const catById = new Map(categories.map((c) => [c.id, c]));

  const months = budgetGroupsByMonth(txns);
  const income = Object.fromEntries(incomeByMonth(txns));

  // Per-expense detail for the click-through modal (your share only).
  const details: DetailItem[] = txns
    .filter((t) => t.direction === "outflow" && !t.is_transfer)
    .map((t) => {
      const cat = t.category_id ? catById.get(t.category_id) : undefined;
      return {
        id: t.id,
        month: monthKey(t.txn_date),
        date: t.txn_date,
        description: t.description,
        category: cat?.name ?? null,
        group: (t.budget_group ?? "unclassified") as Group,
        amount: myAmount(t),
        full: t.amount,
        split: t.split_count,
      };
    })
    .filter((d) => d.amount > 0);

  const totals = months.reduce(
    (a, m) => ({
      needs: a.needs + m.needs,
      wants: a.wants + m.wants,
      savings: a.savings + m.savings,
      unclassified: a.unclassified + m.unclassified,
      total: a.total + m.total,
    }),
    { needs: 0, wants: 0, savings: 0, unclassified: 0, total: 0 },
  );
  const classified = totals.needs + totals.wants + totals.savings;
  const pct = (n: number) => (classified > 0 ? n / classified : 0);
  const totalIncome = Object.values(income).reduce((s, v) => s + v, 0);
  const avgSpend = months.length ? (totals.needs + totals.wants + totals.unclassified) / months.length : 0;

  const chartData = months.map((m) => ({
    label: m.label.split(" ")[0],
    Needs: m.needs,
    Wants: m.wants,
    Savings: m.savings,
  }));

  const empty = months.length === 0;

  function delta(actual: number, target: number) {
    const pp = Math.round((actual - target) * 100);
    if (pp === 0) return <span className="text-muted-foreground">on target</span>;
    return (
      <span className={pp > 0 ? "text-negative" : "text-positive"}>
        {pp > 0 ? "+" : ""}
        {pp}pp vs {Math.round(target * 100)}%
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="Your spending through the 50/30/20 lens — click a month to verify every expense."
      />

      {empty ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No spending yet to analyze.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Needs · target 50%"
              value={<span style={{ color: COLORS.needs }}>{fmtPct(pct(totals.needs), 0)}</span>}
              hint={<>{fmtMoney(totals.needs)} · {delta(pct(totals.needs), TARGET.needs)}</>}
            />
            <StatCard
              label="Wants · target 30%"
              value={<span style={{ color: COLORS.wants }}>{fmtPct(pct(totals.wants), 0)}</span>}
              hint={<>{fmtMoney(totals.wants)} · {delta(pct(totals.wants), TARGET.wants)}</>}
            />
            <StatCard
              label="Savings · target 20%"
              value={<span style={{ color: COLORS.savings }}>{fmtPct(pct(totals.savings), 0)}</span>}
              hint={<>{fmtMoney(totals.savings)} · {delta(pct(totals.savings), TARGET.savings)}</>}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Percentages are of classified spending. Click any month below to set each expense as
            Needs, Wants, or Savings.
            {totals.unclassified > 0 ? ` ${fmtMoney(totals.unclassified)} is still unclassified.` : ""}
          </p>

          <Card>
            <CardHeader>
              <CardTitle>Monthly needs / wants / savings</CardTitle>
            </CardHeader>
            <CardContent>
              <BarSeriesChart
                data={chartData}
                stacked
                series={[
                  { key: "Needs", name: "Needs", color: COLORS.needs },
                  { key: "Wants", name: "Wants", color: COLORS.wants },
                  { key: "Savings", name: "Savings", color: COLORS.savings },
                ]}
                height={280}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Avg monthly spend" value={<Money value={avgSpend} />} hint={`Over ${months.length} months · excl. savings`} />
            <StatCard label="Total income" value={<Money value={totalIncome} />} hint="Paychecks + Frictionless" accent="positive" />
            <StatCard label="Total saved" value={<Money value={totals.savings} />} hint="Investments + vault" accent="positive" />
            <StatCard label="Total spent" value={<Money value={totals.needs + totals.wants + totals.unclassified} />} hint="Excl. savings" />
          </div>

          <MonthlyBreakdown months={months} income={income} details={details} />
        </>
      )}
    </div>
  );
}
