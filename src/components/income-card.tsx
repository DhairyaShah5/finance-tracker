"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/stat-card";
import { CountUp } from "@/components/count-up";
import { Money } from "@/components/money";

export interface IncomeSource {
  label: string;
  total: number;
  count: number;
}

/** Total-income KPI that opens a by-source split. Derived from the ledger, so it
 *  grows automatically as new paychecks land. */
export function IncomeCard({ income, sources }: { income: number; sources: IncomeSource[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <StatCard
        label="Total income"
        value={<CountUp value={income} cents />}
        hint="Arrival + Paychecks · view split"
        accent="positive"
        icon={<TrendingUp />}
        iconClassName="bg-positive"
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Income breakdown</DialogTitle>
            <DialogDescription>
              Every dollar in, by source — updates automatically as new paychecks land.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {sources.map((s) => {
              const pct = income > 0 ? s.total / income : 0;
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{s.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{s.count}×</span>
                    </span>
                    <span className="shrink-0 tnum">
                      <Money value={s.total} cents className="font-medium" />
                      <span className="ml-1.5 text-xs text-muted-foreground">{Math.round(pct * 100)}%</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full grad-brand"
                      style={{ width: `${Math.max(2, pct * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-1 flex items-center justify-between border-t-2 border-border pt-3 text-sm font-semibold">
            <span>Total income</span>
            <Money value={income} cents className="tnum" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
