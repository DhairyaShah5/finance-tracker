"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Settings2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { Reveal } from "@/components/reveal";
import { BarSeriesChart, DonutChart } from "@/components/charts";
import { cn } from "@/lib/utils";
import { hueColor, fmtMoney } from "@/lib/format";
import type { BudgetStatus } from "@/lib/calc";

function barColor(pct: number): string {
  if (pct > 1) return "var(--negative)";
  if (pct >= 0.85) return "var(--warning)";
  return "var(--positive)";
}

function Bar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(2, Math.min(100, pct * 100))}%`, background: barColor(pct) }}
      />
    </div>
  );
}

export function BudgetView({
  statuses,
  currentMonth,
  daysLeft,
}: {
  statuses: BudgetStatus[];
  currentMonth: string;
  daysLeft: number;
}) {
  const currentIdx = Math.max(0, statuses.findIndex((s) => s.month === currentMonth));
  const [idx, setIdx] = React.useState(currentIdx === -1 ? statuses.length - 1 : currentIdx);
  const status = statuses[idx];

  if (!status) {
    return (
      <Card className="surface">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Wallet className="size-5" />
          </span>
          <p className="text-sm font-medium">No spending data yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Once you log a few expenses, budgets are learned automatically from your recent months.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isCurrent = status.month === currentMonth;
  const left = status.totalBudget - status.totalSpent;
  const pct = status.totalBudget > 0 ? status.totalSpent / status.totalBudget : 0;
  const daily = left > 0 && daysLeft > 0 ? left / daysLeft : 0;
  const over = left < 0;
  const monthNum = Number(status.month.slice(5, 7));
  const summer = monthNum >= 6 && monthNum <= 8;

  const trendData = statuses.map((s) => ({
    label: s.label.split(" ")[0],
    Budget: s.totalBudget,
    Spent: s.totalSpent,
  }));
  const donut = status.categories
    .filter((c) => c.spent > 0)
    .map((c) => ({ name: c.name, value: c.spent, color: hueColor(c.hue) }));

  return (
    <div className="space-y-4">
      {/* Month switcher */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">
          {status.label}
          {isCurrent ? <span className="ml-2 text-xs font-normal text-muted-foreground">this month</span> : null}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setIdx((i) => Math.min(statuses.length - 1, i + 1))}
          disabled={idx === statuses.length - 1}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Headline */}
      <Reveal key={`h-${status.month}`}>
        <Card className="surface sheen overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {over ? "Over budget" : isCurrent ? "Left to spend" : "Under budget"} · {status.label}
                </p>
                <Money
                  value={Math.abs(left)}
                  cents
                  className={cn("text-4xl font-bold tnum sm:text-5xl", over ? "text-negative" : "grad-text")}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {isCurrent && !over
                    ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left · about ${fmtMoney(daily, { cents: true })}/day`
                    : `${fmtMoney(status.totalSpent, { cents: true })} spent of ${fmtMoney(status.totalBudget, { cents: true })}`}
                </p>
              </div>
              <div className="space-y-1 text-right text-sm">
                <div className="text-muted-foreground">
                  Spent <Money value={status.totalSpent} cents className="font-semibold text-foreground" />
                </div>
                <div className="text-muted-foreground">
                  Budget <Money value={status.totalBudget} cents className="font-semibold text-foreground" />
                </div>
              </div>
            </div>
            <Bar pct={pct} className="mt-4 h-2.5" />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {Math.round(pct * 100)}% of budget used
              {status.unbudgetedSpent > 0.005
                ? ` · ${fmtMoney(status.unbudgetedSpent, { cents: true })} uncategorized`
                : ""}
            </p>
          </CardContent>
        </Card>
      </Reveal>

      {/* Charts */}
      <Reveal delay={60}>
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="surface lg:col-span-3">
            <CardHeader>
              <CardTitle>Budget vs spent by month</CardTitle>
            </CardHeader>
            <CardContent>
              <BarSeriesChart
                data={trendData}
                series={[
                  { key: "Budget", name: "Budget", color: "var(--chart-3)" },
                  { key: "Spent", name: "Spent", color: "var(--chart-1)" },
                ]}
                height={260}
              />
            </CardContent>
          </Card>
          <Card className="surface lg:col-span-2">
            <CardHeader>
              <CardTitle>Where it went · {status.label.split(" ")[0]}</CardTitle>
            </CardHeader>
            <CardContent>
              {donut.length ? (
                <DonutChart data={donut} height={260} />
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">No spending this month.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </Reveal>

      {/* Adaptive note */}
      <div className="flex items-start gap-2 rounded-xl border border-border bg-card/50 px-3.5 py-2.5 text-xs text-muted-foreground backdrop-blur-sm">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <p>
          Budgets learn from your last 3 months and update automatically.
          {summer
            ? " You're in summer mode — as your internship months land, eating-out and other budgets rise to match, then ease back at school."
            : ""}{" "}
          Pin a category in{" "}
          <Link href="/settings" className="text-primary underline-offset-2 hover:underline">Settings</Link> to lock it.
        </p>
      </div>

      {/* Per-category */}
      <Reveal delay={120}>
        <Card className="surface">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>By category</CardTitle>
            <Link
              href="/settings"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Settings2 className="size-3.5" /> Edit budgets
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {status.categories.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No spending this month.</p>
            ) : (
              status.categories.map((c) => {
                const cpct = c.budget > 0 ? c.spent / c.budget : c.spent > 0 ? 1 : 0;
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: hueColor(c.hue) }} />
                        <span className="truncate">{c.name}</span>
                        {c.trend === "up" ? (
                          <TrendingUp className="size-3.5 shrink-0 text-negative" />
                        ) : c.trend === "down" ? (
                          <TrendingDown className="size-3.5 shrink-0 text-positive" />
                        ) : null}
                        {!c.isAuto ? (
                          <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                            pinned
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tnum text-muted-foreground">
                        <Money value={c.spent} cents className="font-semibold text-foreground" /> /{" "}
                        <Money value={c.budget} cents />
                      </span>
                    </div>
                    <Bar pct={cpct} className="mt-1.5 h-2" />
                    <p
                      className="mt-1 text-xs tnum"
                      style={{ color: c.remaining < 0 ? "var(--negative)" : "var(--muted-foreground)" }}
                    >
                      {c.remaining >= 0
                        ? `${fmtMoney(c.remaining, { cents: true })} left`
                        : `${fmtMoney(-c.remaining, { cents: true })} over`}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}
