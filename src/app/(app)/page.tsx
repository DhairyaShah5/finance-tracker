import Link from "next/link";
import { Landmark, PiggyBank, TrendingDown, Wallet } from "lucide-react";
import { requireUser } from "@/lib/queries";
import {
  buildMonthlySummaries,
  monthlyBudget,
  monthlyBudgetStatus,
  monthlyBalances,
  monthlyCashFlow,
  categoryTotals,
  accountActivity,
  reconcile,
  isArrivalDeposit,
  isSavingsTxn,
  myAmount,
  debtorBalances,
  creditorBalances,
  sumOwedByMe,
  signed,
} from "@/lib/calc";
import { fmtMoney, fmtDate, hueColor, monthKey, monthLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { IncomeCard, type IncomeSource } from "@/components/income-card";
import { OwedCard } from "@/components/owed-card";
import { Money } from "@/components/money";
import { CountUp } from "@/components/count-up";
import { Reveal } from "@/components/reveal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendChart, BarSeriesChart } from "@/components/charts";
import { DonutBreakdown } from "@/components/donut-breakdown";
import { SpendingTreemap, type TreemapCat } from "@/components/spending-treemap";
import { CashFlowChart } from "@/components/cash-flow-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();

  const [settingsRes, txnsRes, accountsRes, categoriesRes, debtorsRes, creditorsRes, inflowRes] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", user.id).single(),
    supabase.from("transactions").select("*").eq("user_id", user.id).order("txn_date", { ascending: true }),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("categories").select("*").eq("user_id", user.id),
    supabase.from("debtors").select("*").eq("user_id", user.id),
    supabase.from("creditors").select("*").eq("user_id", user.id),
    supabase.from("inflow_types").select("*").eq("user_id", user.id),
  ]);

  // requireUser() guarantees a settings row, but stay defensive against a null.
  const settings = settingsRes.data ?? { starting_funds: 0, budget_months: 12, savings_target: 0 };
  const txns = txnsRes.data ?? [];
  const accounts = accountsRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  const debtors = debtorsRes.data ?? [];
  const creditors = creditorsRes.data ?? [];
  const inflowTypes = inflowRes.data ?? [];

  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const catTotals = categoryTotals(txns, categories);
  const acctActivity = accountActivity(txns, accounts, categories);
  const netWorth = acctActivity
    .filter((a) => a.account.include_in_net_worth)
    .reduce((s, a) => s + a.balance, 0);

  // Full reconciliation - every dollar in exactly one bucket:
  // arrival + income − spending − savings − net-fronted = net worth. Arrival
  // capital is starting funds, not income, so it sits in its own bucket.
  const recon = reconcile(txns, netWorth);
  const totalWealth = netWorth + recon.savings; // spendable + what's set aside
  // Everything owed back to you comes from ONE source now - money fronted on
  // reimbursable expenses (a Friend expense is always reimbursable) that hasn't
  // landed yet. `recon.reimbursable` is that total, so it's never double-counted.
  // We split it for the modal: expenses attached to a person are grouped under
  // that debtor; the rest (e.g. work) shows as loose reimbursables.
  const totalOwed = recon.reimbursable;
  const owedReimbursables = txns
    .filter((t) => t.direction === "outflow" && !t.is_transfer && t.reimbursable && !t.debtor_id)
    .map((t) => ({
      id: t.id,
      description: t.description,
      date: t.txn_date,
      outstanding: r2(r2(t.amount - myAmount(t)) - (t.reimbursed_amount ?? 0)),
    }))
    .filter((r) => r.outstanding > 0.005)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const owedDebtors = debtorBalances(txns, debtors)
    .filter((b) => b.outstanding > 0.005)
    .map((b) => ({ id: b.debtor.id, name: b.debtor.name, note: b.debtor.note, amount: b.outstanding }))
    .sort((a, b) => b.amount - a.amount);
  // The other side of the ledger: money you owe people (creditors). The single
  // People KPI shows your NET position - receivables minus payables - and flips
  // its label to "I owe" when you owe more than you're owed.
  const owedCreditors = creditorBalances(txns, creditors)
    .filter((b) => b.outstanding > 0.005)
    .map((b) => ({ id: b.creditor.id, name: b.creditor.name, note: b.creditor.note, amount: b.outstanding }))
    .sort((a, b) => b.amount - a.amount);
  const oweThem = sumOwedByMe(creditorBalances(txns, creditors));

  // Income split by source (each paycheck / inflow type) for the modal. Arrival
  // capital is starting funds, not income, so it's left out here just like in
  // recon.income - the sources sum to recon.income and grow as new income lands.
  const inflowName = new Map(inflowTypes.map((i) => [i.id, i.name]));
  const incomeAgg = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    if (t.direction !== "inflow" || t.is_transfer) continue;
    if (t.category_id) continue; // categorized inflow = refund/return, not income
    if (isArrivalDeposit(t)) continue; // arrival capital = starting funds, not income
    const label = t.inflow_type_id ? inflowName.get(t.inflow_type_id) ?? "Other" : "Other";
    const cur = incomeAgg.get(label) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    incomeAgg.set(label, cur);
  }
  const incomeSources: IncomeSource[] = [...incomeAgg.entries()]
    .map(([label, v]) => ({ label, total: r2(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total);

  // Opening/closing available-funds balance per month - the SINGLE source of
  // truth for both the balance-over-time chart and the month table below it, so
  // the two can never disagree. Only net-worth accounts move the balance.
  const nwIds = new Set(accounts.filter((a) => a.include_in_net_worth).map((a) => a.id));
  const balancesByMonth = [...monthlyBalances(txns, nwIds, netWorth).entries()]
    .map(([m, b]) => ({ key: m, label: monthLabel(m), opening: b.opening, closing: b.closing }))
    .sort((a, b) => (a.key < b.key ? -1 : 1)); // oldest -> newest
  const monthRows = [...balancesByMonth].reverse(); // newest first for the table

  const summaries = buildMonthlySummaries(txns, {
    monthlyBudget: monthlyBudget(settings),
    openingBalance: 0, // closing chain unused here; the chart uses monthlyBalances
  });

  // Chart series - the exact monthly closing balances, so the line always matches
  // the month table. The first tracked month is the starting point (no separate
  // "Start" node - the arrival month already carries the opening capital).
  const balanceSeries = balancesByMonth.map((b) => ({
    label: b.label.split(" ")[0],
    balance: b.closing,
  }));
  // Budget bar chart uses the same income-anchored engine as the Budget page,
  // so the two always agree (typical spend + headroom, allocated per month).
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
      runwayFloor,
    ),
  );
  const budgetSeries = budgetStatuses.map((s) => ({
    label: s.label.split(" ")[0],
    Spent: s.totalSpent,
    Budget: s.totalBudget,
  }));
  // Monthly surplus / deficit: earned income − living expenses − investments.
  // Arrival capital excluded (one-time starting funds), so the bars read as
  // "did this month's income cover what I spent and set aside?"
  const cashFlow = monthlyCashFlow(txns).map((m) => ({ ...m, label: m.label.split(" ")[0] }));
  const surplusMonths = cashFlow.filter((m) => m.net >= 0).length;
  // Spending donut: every category expanded (no "Other" bucket). Refunds are
  // netted into their category, so the donut total, the "Total spent" KPI
  // (recon.spending), and the reconciliation "Spending" line all agree exactly.
  const spendDonut = catTotals
    .filter((c) => c.total > 0)
    .map((c) => ({ name: c.name, value: c.total, color: hueColor(c.hue) }));


  // Recent transactions
  const catById = new Map(categories.map((c) => [c.id, c]));
  const acctById = new Map(accounts.map((a) => [a.id, a]));

  // Spending treemap: each category is a tile sized by your spend; drilling into
  // one reveals the individual transactions that make it up.
  const treemapByCat = new Map<string, TreemapCat>();
  for (const t of txns) {
    if (t.direction !== "outflow" || t.is_transfer || isSavingsTxn(t)) continue;
    const share = myAmount(t);
    if (share <= 0) continue;
    const key = t.category_id ?? "__none__";
    const cat = t.category_id ? catById.get(t.category_id) : undefined;
    const g =
      treemapByCat.get(key) ??
      { id: key, name: cat?.name ?? "Uncategorized", hue: cat?.color_hue ?? null, total: 0, txns: [] };
    g.total = r2(g.total + share);
    g.txns.push({ name: t.description, value: r2(share), date: t.txn_date });
    treemapByCat.set(key, g);
  }
  const treemapCats: TreemapCat[] = [...treemapByCat.values()]
    .map((c) => ({ ...c, txns: c.txns.sort((a, b) => b.value - a.value) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
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
          {/* Hero - available funds at a glance */}
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
                value={<CountUp value={recon.spending} cents />}
                hint={`${spendDonut.length} categories`}
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
              <OwedCard
                owed={totalOwed}
                oweThem={oweThem}
                reimbursables={owedReimbursables}
                debtors={owedDebtors}
                creditors={owedCreditors}
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
                  <DonutBreakdown
                    data={spendDonut}
                    height={230}
                    maxItems={spendDonut.length}
                    centerLabel="Spent"
                    emptyText="No spending to chart."
                  />
                </CardContent>
              </Card>
            </div>
          </Reveal>

          {/* Spending treemap - click a category to drill into its transactions */}
          <Reveal delay={330}>
            <Card className="surface">
              <CardHeader>
                <CardTitle>Where your money goes</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Click any category to zoom into the transactions behind it.
                </p>
              </CardHeader>
              <CardContent>
                <SpendingTreemap data={treemapCats} />
              </CardContent>
            </Card>
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

          {/* Monthly surplus / deficit (net cash flow) */}
          <Reveal delay={390}>
            <Card className="surface">
              <CardHeader>
                <CardTitle>Monthly surplus / deficit</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Earned income minus living expenses and investments · surplus in {surplusMonths} of {cashFlow.length} months.
                  Arrival capital excluded as one-time starting funds.
                </p>
              </CardHeader>
              <CardContent>
                <CashFlowChart data={cashFlow} />
              </CardContent>
            </Card>
          </Reveal>

          {/* Recent + accounts */}
          <Reveal delay={420}>
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="surface lg:col-span-3">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
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
                <CardHeader className="flex flex-row items-center justify-between gap-2">
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
