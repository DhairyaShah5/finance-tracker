import Link from "next/link";
import { Settings2, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { Reveal } from "@/components/reveal";
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

export function BudgetView({ status, daysLeft }: { status: BudgetStatus; daysLeft: number }) {
  const left = status.totalBudget - status.totalSpent;
  const pct = status.totalBudget > 0 ? status.totalSpent / status.totalBudget : 0;
  const daily = left > 0 && daysLeft > 0 ? left / daysLeft : 0;
  const unbudgeted = status.totalSpent - status.budgetedSpent;
  const over = left < 0;

  if (status.totalBudget === 0 && status.categories.length === 0) {
    return (
      <Card className="surface">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Wallet className="size-5" />
          </span>
          <p className="text-sm font-medium">No budgets set yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Set a monthly budget for each category in Settings to track what is left to spend.
          </p>
          <Link href="/settings" className="text-sm text-primary underline-offset-2 hover:underline">
            Go to Settings
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Headline: what's left this month */}
      <Reveal>
        <Card className="surface sheen overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {over ? "Over budget" : "Left to spend"} · {status.label}
                </p>
                <Money
                  value={Math.abs(left)}
                  cents
                  className={cn("text-4xl font-bold tnum sm:text-5xl", over ? "text-negative" : "grad-text")}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                  {!over ? ` · about ${fmtMoney(daily, { cents: true })}/day` : ""}
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
              {unbudgeted > 0.005 ? ` · ${fmtMoney(unbudgeted, { cents: true })} spent in unbudgeted categories` : ""}
            </p>
          </CardContent>
        </Card>
      </Reveal>

      {/* Per-category */}
      <Reveal delay={80}>
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
            {status.categories.map((c) => {
              const cpct = c.budget > 0 ? c.spent / c.budget : c.spent > 0 ? 1 : 0;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: hueColor(c.hue) }} />
                      <span className="truncate">{c.name}</span>
                      {!c.hasBudget ? (
                        <span className="shrink-0 text-xs font-normal text-muted-foreground">no budget</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tnum text-muted-foreground">
                      <Money value={c.spent} cents className="font-semibold text-foreground" />
                      {c.hasBudget ? <> / <Money value={c.budget} cents /></> : null}
                    </span>
                  </div>
                  {c.hasBudget ? (
                    <>
                      <Bar pct={cpct} className="mt-1.5 h-2" />
                      <p
                        className="mt-1 text-xs tnum"
                        style={{ color: c.remaining < 0 ? "var(--negative)" : "var(--muted-foreground)" }}
                      >
                        {c.remaining >= 0
                          ? `${fmtMoney(c.remaining, { cents: true })} left`
                          : `${fmtMoney(-c.remaining, { cents: true })} over`}
                      </p>
                    </>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}
