import Link from "next/link";
import { Landmark, PiggyBank, TrendingDown, Users, Wallet } from "lucide-react";
import { requireUser } from "@/lib/queries";
import {
  buildMonthlySummaries,
  monthlyBudget,
  monthlyBudgetStatus,
  monthlyBalances,
  categoryTotals,
  accountActivity,
  realBalanceTrend,
  reconcile,
  isArrivalDeposit,
  sumOwed,
  signed,
} from "@/lib/calc";
import { fmtMoney, fmtDate, hueColor, monthKey, monthLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { IncomeCard, type IncomeSource } from "@/components/income-card";
import { Money } from "@/components/money";
import { CountUp } from "@/components/count-up";
import { Reveal } from "@/components/reveal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendChart, BarSeriesChart } from "@/components/charts";
import { DonutBreakdown } from "@/components/donut-breakdown";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();

  const [settingsRes, txnsRes, accountsRes, categoriesRes, debtorsRes, inflowRes] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", user.id).single(),
    supabase.from("transactions").select("*").eq("user_id", user.id).order("txn_date", { ascending: true }),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("categories").select("*").eq("user_id", user.id),
    supabase.from("debtors").select("*").eq("user_id", user.id),
    supabase.from("inflow_types").select("*").eq("user_id", user.id),
  ]);

  // requireUser() guarantees a settings row, but stay defensive against a null.
  const settings = settingsRes.data ?? { starting_funds: 0, budget_months: 12, savings_target: 0 };
  const txns = txnsRes.data ?? [];
  const accounts = accountsRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  const debtors = debtorsRes.data ?? [];
  const inflowTypes = inflowRes.data ?? [];

  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const catTotals = categoryTotals(txns, categories);
  const acctActivity = accountActivity(txns, accounts, categories);
  const netWorth = acctActivity
    .filter((a) => a.account.include_in_net_worth)
    .reduce((s, a) => s + a.balance, 0);
  const owed = sumOwed(debtors);

  // Full reconciliation - every dollar in exactly one bucket:
  // income (incl. arrival capital) − spending − savings − net-fronted = net worth.
  const recon = reconcile(txns, netWorth);
  const totalWealth = netWorth + recon.savings; // spendable + what's set aside

  // Income split by source (arrival + each paycheck/inflow type) for the modal.
  // Sums to recon.income and grows automatically as new income lands.
  const inflowName = new Map(inflowTypes.map((i) => [i.id, i.name]));
  const incomeAgg = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    if (t.direction !== "inflow" || t.is_transfer) continue;
    const label = isArrivalDeposit(t)
      ? "Arrival capital"
      : t.inflow_type_id
        ? inflowName.get(t.inflow_type_id) ?? "Other"
        : "Other";
    const cur = incomeAgg.get(label) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    incomeAgg.set(label, cur);
  }
  const incomeSources: IncomeSource[] = [...incomeAgg.entries()]
    .map(([label, v]) => ({ label, total: r2(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total);

  // Opening/closing available-funds balance per month (newest first) — fills out
  // the balance-over-time card and matches the Transactions ledger figures.
  const nwIds = new Set(accounts.filter((a) => a.include_in_net_worth).map((a) => a.id));
  const monthRows = [...monthlyBalances(txns, nwIds, netWorth).entries()]
    .map(([m, b]) => ({ key: m, label: monthLabel(m), opening: b.opening, closing: b.closing }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));

  const summaries = buildMonthlySummaries(txns, {
    monthlyBudget: monthlyBudget(settings),
    openingBalance: 0, // closing chain unused here; the trend uses realBalanceTrend
  });

  // Chart series - balance trajectory from arrival capital to current net worth.
  // Exclude the arrival deposits themselves (they constitute the starting
  // balance, so counting them as flows would double-count). This matches the
  // source workbook's monthly closing balances exactly.
  const balanceTrend = realBalanceTrend(
    txns.filter((t) => !isArrivalDeposit(t)),
    netWorth,
  );
  const balanceSeries = [
    { label: "Start", balance: settings.starting_funds },
    ...balanceTrend.map((p) => ({ label: p.label.split(" ")[0], balance: p.balance })),
  ];
  // Budget bar chart uses the same income-anchored engine as the Budget page,
  // so the two always agree (recent income − savings target, allocated per month).
  const savingsTarget = settings.savings_target ?? 0;
  const runwayFloor = settings.budget_months > 0 ? settings.starting_funds / settings.budget_months : 0;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const budgetMonths = [...new Set([...txns.map((t) => monthKey(t.txn_date)), currentMonth])].sort();
  const budgetStatuses = budgetMonths.map((m) =>
    monthlyBudgetStatus(
      txns,
      categories,
      m,
      m === currentMonth ? now.getDate() : undefined,
      savingsTarget,
      runwayFloor,
    ),
  );
  const budgetSeries = budgetStatuses.map((s) => ({
    label: s.label.split(" ")[0],
    Spent: s.totalSpent,
    Budget: s.totalBudget,
  }));
  // Show every category individually (no "Other" bucket).
  const donut = catTotals
    .filter((c) => c.total > 0)
    .map((c) => ({ name: c.name, value: c.total, color: hueColor(c.hue) }));
  // Categorized spending — exactly the donut total, so the KPI and wheel agree.
  const totalSpentCategorized = r2(donut.reduce((s, d) => s + d.value, 0));

  // Recent transactions
  const catById = new Map(categories.map((c) => [c.id, c]));
  const acctById = new Map(accounts.map((a) => [a.id, a]));
  const recent = [...txns]
    .sort((a, b) => (a.txn_date < b.txn_date ? 1 : a.txn_date > b.txn_date ? -1 : 0))
    .slice(0, 8);

  const empty = txns.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          summaries.length
            ? `${summaries[0].label} – ${summaries[summaries.length - 1].label}`
            : "Your cash flow at a glance"
        }
      />

      {empty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Wallet className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No data yet</p>
              <p className="text-sm text-muted-foreground">
                Add a transaction from the{" "}
                <Link href="/transactions" className="text-primary underline-offset-2 hover:underline">
                  Transactions
                </Link>{" "}
                page to get started.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Hero — available funds at a glance */}
          <Reveal>
            <Card className="surface sheen relative overflow-hidden py-0">
              <div
                className="pointer-events-none absolute -left-10 -top-20 size-72 rounded-full grad-brand opacity-20 blur-3xl"
                aria-hidden
              />
              <div
                className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between"
                style={{ padding: "1.75rem" }}
              >
                <div className="min-w-0">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="flex size-7 items-center justify-center rounded-xl grad-brand text-white shadow-sm shadow-primary/30 [&_svg]:size-4">
                      <Wallet />
                    </span>
                    Available funds
                  </span>
                  <div className="mt-3 text-4xl font-bold tracking-tight tnum grad-text sm:text-5xl">
                    <CountUp value={netWorth} cents />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">Spendable cash across your accounts</p>
                </div>
                <div className="shrink-0 md:border-l md:border-border/60 md:pl-8">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total with savings
                  </span>
                  <div className="mt-2 text-2xl font-semibold tracking-tight tnum sm:text-3xl">
                    {fmtMoney(totalWealth, { cents: true })}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">Across every account, including savings</p>
                </div>
              </div>
            </Card>
          </Reveal>

          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Reveal delay={60} className="h-full">
              <IncomeCard income={recon.income} sources={incomeSources} />
            </Reveal>
            <Reveal delay={120} className="h-full">
              <StatCard
                label="Total spent"
                value={<CountUp value={totalSpentCategorized} cents />}
                hint={`Across ${donut.length} categories`}
                icon={<TrendingDown />}
                iconClassName="bg-negative"
              />
            </Reveal>
            <Reveal delay={180} className="h-full">
              <StatCard
                label="Saved"
                value={<CountUp value={recon.savings} cents />}
                hint="Marcus + RobinHood"
                accent="positive"
                icon={<PiggyBank />}
                iconClassName="bg-positive"
              />
            </Reveal>
            <Reveal delay={240} className="h-full">
              <StatCard
                label="Owed to me"
                value={<CountUp value={owed} cents />}
                hint={debtors.length ? `${debtors.length} debtor${debtors.length === 1 ? "" : "s"}` : "All settled"}
                icon={<Users />}
              />
            </Reveal>
          </div>

          {/* Balance trend + spending mix */}
          <Reveal delay={300}>
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="surface lg:col-span-3">
                <CardHeader>
                  <CardTitle>Balance over time</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendChart data={balanceSeries} series={[{ key: "balance", name: "Closing balance" }]} />
                  {/* Monthly opening→closing available funds, newest first. */}
                  <div className="mt-4 border-t border-border/60 pt-3">
                    <div className="mb-1 flex items-center justify-between px-1 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
                      <span>Month</span>
                      <span>Change · closing</span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {monthRows.map((r) => {
                        const change = r2(r.closing - r.opening);
                        return (
                          <div key={r.key} className="flex items-center justify-between px-1 py-1.5 text-sm">
                            <span className="text-muted-foreground">{r.label}</span>
                            <span className="flex items-center gap-4 tnum">
                              <span className={change >= 0 ? "text-positive" : "text-negative"}>
                                {fmtMoney(change, { sign: true, cents: true })}
                              </span>
                              <span className="w-24 text-right font-medium">
                                {fmtMoney(r.closing, { cents: true })}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="surface lg:col-span-2">
                <CardHeader>
                  <CardTitle>Spending by category</CardTitle>
                </CardHeader>
                <CardContent>
                  <DonutBreakdown data={donut} height={230} centerLabel="Spent" emptyText="No spending to chart." />
                </CardContent>
              </Card>
            </div>
          </Reveal>

          {/* Monthly spending vs budget */}
          <Reveal delay={360}>
            <Card className="surface">
              <CardHeader>
                <CardTitle>Monthly spending vs budget</CardTitle>
              </CardHeader>
              <CardContent>
                <BarSeriesChart
                  data={budgetSeries}
                  series={[
                    { key: "Spent", name: "Spent", color: "var(--chart-1)" },
                    { key: "Budget", name: "Budget", color: "var(--chart-3)" },
                  ]}
                />
              </CardContent>
            </Card>
          </Reveal>

          {/* Recent + accounts */}
          <Reveal delay={420}>
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="surface lg:col-span-3">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Recent transactions</CardTitle>
                  <Link href="/transactions" className="text-sm text-primary underline-offset-2 hover:underline">
                    View all
                  </Link>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  {recent.map((t) => {
                    const cat = t.category_id ? catById.get(t.category_id) : undefined;
                    const acct = acctById.get(t.account_id);
                    return (
                      <div key={t.id} className="flex items-center gap-3 py-2.5">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: cat ? hueColor(cat.color_hue) : "var(--muted-foreground)" }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{t.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDate(t.txn_date, "short")} · {acct?.name ?? "-"}
                            {cat ? ` · ${cat.name}` : ""}
                          </p>
                        </div>
                        <Money value={signed(t)} cents colored className="text-sm font-medium" />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
              <Card className="surface lg:col-span-2">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Accounts</CardTitle>
                  <Link href="/accounts" className="text-sm text-primary underline-offset-2 hover:underline">
                    View all
                  </Link>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  {acctActivity.map(({ account, balance: bal }) => (
                    <div key={account.id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Landmark className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{account.name}</p>
                          <p className="text-xs text-muted-foreground">{account.bank}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Money value={bal} cents colored={account.is_credit} className="text-sm font-medium" />
                        {account.is_credit ? (
                          <Badge variant="outline" className="ml-1 text-[10px]">
                            credit
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </Reveal>
        </>
      )}
    </div>
  );
}
