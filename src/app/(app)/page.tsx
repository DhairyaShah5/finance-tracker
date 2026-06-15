import Link from "next/link";
import { Flag, Landmark, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { requireUser } from "@/lib/queries";
import {
  buildMonthlySummaries,
  monthlyBudget,
  categoryTotals,
  accountActivity,
  realBalanceTrend,
  sumOwed,
  signed,
} from "@/lib/calc";
import { fmtMoney, fmtDate, hueColor } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendChart, BarSeriesChart, DonutChart } from "@/components/charts";

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
  const settings = settingsRes.data ?? { starting_funds: 0, budget_months: 12 };
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

  // Transfers between own accounts are excluded from income/spending.
  const totalIn = txns.filter((t) => t.direction === "inflow" && !t.is_transfer).reduce((s, t) => s + t.amount, 0);
  const totalOut = txns.filter((t) => t.direction === "outflow" && !t.is_transfer).reduce((s, t) => s + t.amount, 0);

  // Accounts are the source of truth for "money I have". The balance trend
  // chains to current net worth: opening seed = netWorth − net cash flow.
  const summaries = buildMonthlySummaries(txns, {
    monthlyBudget: monthlyBudget(settings),
    openingBalance: netWorth - (totalIn - totalOut),
  });

  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = summaries.find((m) => m.month === thisMonthKey) ?? summaries[summaries.length - 1];

  // Chart series — real balance trajectory, starting from your arrival capital
  // and ending at current net worth.
  const balanceTrend = realBalanceTrend(txns, netWorth);
  const balanceSeries = [
    { label: "Start", balance: settings.starting_funds },
    ...balanceTrend.map((p) => ({ label: p.label.split(" ")[0], balance: p.balance })),
  ];
  const budgetSeries = summaries.map((m) => ({
    label: m.label.split(" ")[0],
    Spent: m.totalExpenses,
    Budget: m.budget,
  }));
  const topCats = catTotals.slice(0, 7);
  const restTotal = catTotals.slice(7).reduce((s, c) => s + c.total, 0);
  const donut = [
    ...topCats.map((c) => ({ name: c.name, value: c.total, color: hueColor(c.hue) })),
    ...(restTotal > 0 ? [{ name: "Other", value: restTotal, color: "var(--muted-foreground)" }] : []),
  ];

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
                Import your Excel workbook from{" "}
                <Link href="/settings" className="text-primary underline-offset-2 hover:underline">
                  Settings
                </Link>{" "}
                or add a transaction to get started.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Starting balance"
              value={<Money value={settings.starting_funds} cents />}
              hint="Arrived with"
              icon={<Flag className="size-4" />}
            />
            <StatCard
              label="Available funds"
              value={<Money value={netWorth} cents />}
              hint={`${fmtMoney(netWorth - settings.starting_funds, { sign: true })} since arrival`}
              icon={<Wallet className="size-4" />}
            />
            <StatCard
              label={`${thisMonth?.label.split(" ")[0] ?? "Month"} net spend`}
              value={<Money value={thisMonth?.netSpending ?? 0} />}
              hint={
                thisMonth
                  ? `${fmtMoney(Math.abs(thisMonth.variance))} ${thisMonth.variance >= 0 ? "under" : "over"} budget`
                  : undefined
              }
              accent={thisMonth && thisMonth.variance >= 0 ? "positive" : "negative"}
            />
            <StatCard
              label="Total income"
              value={<Money value={totalIn} />}
              accent="positive"
              icon={<TrendingUp className="size-4" />}
            />
            <StatCard
              label="Total spent"
              value={<Money value={totalOut} />}
              icon={<TrendingDown className="size-4" />}
            />
            <StatCard
              label="Owed to me"
              value={<Money value={owed} />}
              hint={debtors.length ? `${debtors.length} debtor${debtors.length === 1 ? "" : "s"}` : "All settled"}
              icon={<Users className="size-4" />}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Balance over time</CardTitle>
              </CardHeader>
              <CardContent>
                <TrendChart data={balanceSeries} series={[{ key: "balance", name: "Closing balance" }]} />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Spending by category</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart data={donut} />
              </CardContent>
            </Card>
          </div>

          <Card>
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

          {/* Recent + accounts */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
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
                          {fmtDate(t.txn_date, "short")} · {acct?.name ?? "—"}
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
            <Card className="lg:col-span-2">
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
        </>
      )}
    </div>
  );
}
