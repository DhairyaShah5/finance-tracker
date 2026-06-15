import { requireUser } from "@/lib/queries";
import { budgetGroupsByMonth, incomeByMonth } from "@/lib/calc";
import { fmtMoney, fmtPct } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarSeriesChart } from "@/components/charts";

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

  const months = budgetGroupsByMonth(txns, categories);
  const income = incomeByMonth(txns);

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
  const totalIncome = [...income.values()].reduce((s, v) => s + v, 0);
  const avgSpend = months.length ? totals.total / months.length : 0;

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
        description="Your spending through the 50/30/20 lens — needs, wants, and savings."
      />

      {empty ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No spending yet to analyze.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 50/30/20 summary */}
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
            Percentages are of classified spending. Reassign any category to needs / wants / savings
            on the Settings page.
            {totals.unclassified > 0
              ? ` ${fmtMoney(totals.unclassified)} is unclassified.`
              : ""}
          </p>

          {/* Monthly stacked bars */}
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

          {/* Other insights */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Avg monthly spend" value={<Money value={avgSpend} />} hint={`Over ${months.length} months`} />
            <StatCard label="Total income" value={<Money value={totalIncome} />} hint="Paychecks" accent="positive" />
            <StatCard label="Total saved" value={<Money value={totals.savings} />} hint="Into investments" accent="positive" />
            <StatCard label="Total spent" value={<Money value={totals.total} />} hint="All categories" />
          </div>

          {/* Monthly table */}
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Needs</TableHead>
                  <TableHead className="text-right">Wants</TableHead>
                  <TableHead className="text-right">Savings</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Income</TableHead>
                  <TableHead className="text-right">Split (N/W/S)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => {
                  const cls = m.needs + m.wants + m.savings;
                  const p = (n: number) => (cls > 0 ? Math.round((n / cls) * 100) : 0);
                  return (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      <TableCell className="text-right"><Money value={m.needs} /></TableCell>
                      <TableCell className="text-right"><Money value={m.wants} /></TableCell>
                      <TableCell className="text-right"><Money value={m.savings} /></TableCell>
                      <TableCell className="text-right font-medium"><Money value={m.total} /></TableCell>
                      <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                        <Money value={income.get(m.month) ?? 0} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="tnum text-[10px]">
                          {p(m.needs)}/{p(m.wants)}/{p(m.savings)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
