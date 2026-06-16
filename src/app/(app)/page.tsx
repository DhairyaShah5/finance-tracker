import Link from "next/link";
import { Flag, Landmark, PiggyBank, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { requireUser } from "@/lib/queries";
import {
  buildMonthlySummaries,
  monthlyBudget,
  monthlyBudgetStatus,
  categoryTotals,
  accountActivity,
  realBalanceTrend,
  reconcile,
  isArrivalDeposit,
  sumOwed,
  signed,
} from "@/lib/calc";
import { fmtMoney, fmtDate, hueColor, monthKey } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { CountUp } from "@/components/count-up";
import { Reveal } from "@/components/reveal";
import { ReconciliationFlow } from "@/components/reconciliation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendChart, BarSeriesChart } from "@/components/charts";
import { DonutBreakdown } from "@/components/donut-breakdown";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();

  const [settingsRes, txnsRes, accountsRes, categoriesRes, debtorsRes] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", user.id).single(),
    supabase.from("transactions").select("*").eq("user_id", user.id).order("txn_date", { ascending: true }),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("categories").select("*").eq("user_id", user.id),
    supabase.from("debtors").select("*").eq("user_id", user.id),
  ]);

  // requireUser() guarantees a settings row, but stay defensive against a null.
  const settings = settingsRes.data ?? { starting_funds: 0, budget_months: 12, savings_target: 0 };
  const txns = txnsRes.data ?? [];
  const accounts = accountsRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  const debtors = debtorsRes.data ?? [];

  const catTotals = categoryTotals(txns, categories);
  const acctActivity = accountActivity(txns, accounts);
  const netWorth = acctActivity
    .filter((a) => a.account.include_in_net_worth)
    .reduce((s, a) => s + a.balance, 0);
  const owed = sumOwed(debtors);

  // Full reconciliation - every dollar in exactly one bucket:
  // income (incl. arrival capital) − spending − savings − net-fronted = net worth.
  const recon = reconcile(txns, netWorth);

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
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Reveal delay={0} className="h-full">
              <StatCard
                label="Starting balance"
                value={<CountUp value={settings.starting_funds} cents />}
                hint="Arrived with"
                icon={<Flag />}
              />
            </Reveal>
            <Reveal delay={60} className="h-full">
              <StatCard
                label="Available funds"
                value={<CountUp value={netWorth} cents />}
                hint={`${fmtMoney(netWorth - settings.starting_funds, { sign: true })} since arrival`}
                icon={<Wallet />}
              />
            </Reveal>
            <Reveal delay={120} className="h-full">
              <StatCard
                label="Saved"
                value={<CountUp value={recon.savings} cents />}
                hint="Investments + vault"
                accent="positive"
                icon={<PiggyBank />}
                iconClassName="bg-positive"
              />
            </Reveal>
            <Reveal delay={180} className="h-full">
              <StatCard
                label="Total income"
                value={<CountUp value={recon.income - recon.arrivalCapital} cents />}
                hint="Paychecks"
                accent="positive"
                icon={<TrendingUp />}
                iconClassName="bg-positive"
              />
            </Reveal>
            <Reveal delay={240} className="h-full">
              <StatCard
                label="Total spent"
                value={<CountUp value={recon.spending} cents />}
                hint="Incl. net settled"
                icon={<TrendingDown />}
                iconClassName="bg-negative"
              />
            </Reveal>
            <Reveal delay={300} className="h-full">
              <StatCard
                label="Owed to me"
                value={<CountUp value={owed} cents />}
                hint={debtors.length ? `${debtors.length} debtor${debtors.length === 1 ? "" : "s"}` : "All settled"}
                icon={<Users />}
              />
            </Reveal>
          </div>

          {/* The cash identity - how the current balance is reached, to the cent */}
          <Reveal delay={340}>
            <Card className="surface">
              <CardHeader>
                <CardTitle>How your balance adds up</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-w-xl">
                  <ReconciliationFlow data={recon} />
                </div>
              </CardContent>
            </Card>
          </Reveal>

          {/* Charts */}
          <Reveal delay={400}>
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="surface lg:col-span-3">
                <CardHeader>
                  <CardTitle>Balance over time</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendChart data={balanceSeries} series={[{ key: "balance", name: "Closing balance" }]} />
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

          <Reveal delay={460}>
            <Card className="surface">
              <CardHeader>
                <CardTitle>Monthly spending vs budget</CardTitle>
              </CardHeader>
              <CardContent>
                <BarSeriesChart
                  data={budgetSeries}
                  series={[
                    { key: "Spent", name: "Spent", color: "var(--chart-1)" },
                    { key: "Budget", name: "Budget", color: "var(--chart-5)" },
                  ]}
                />
              </CardContent>
            </Card>
          </Reveal>

          {/* Recent + accounts */}
          <Reveal delay={520}>
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
                      <Money
                        value={signed(t)}
                        cents
                        colored
                        className="text-sm font-medium"
                      />
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
