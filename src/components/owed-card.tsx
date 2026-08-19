"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, HandCoins, UserRound } from "lucide-react";
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
import { fmtDate, fmtMoney } from "@/lib/format";

export interface OwedReimbursable {
  id: string;
  description: string;
  date: string;
  outstanding: number;
}
export interface OwedDebtor {
  id: string;
  name: string;
  note: string | null;
  amount: number;
}
export interface OwedCreditor {
  id: string;
  name: string;
  note: string | null;
  amount: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The single "people" KPI. Shows your NET position with other people -
 *  everything owed to you (reimbursable expenses you fronted + debtors) minus
 *  everything you owe (creditors) - and flips its label to "I owe" when the net
 *  tips negative. The breakdown modal always itemizes both sides. */
export function OwedCard({
  owed,
  oweThem,
  reimbursables,
  debtors,
  creditors,
}: {
  owed: number; // total owed TO you (receivables)
  oweThem: number; // total YOU owe (payables)
  reimbursables: OwedReimbursable[];
  debtors: OwedDebtor[];
  creditors: OwedCreditor[];
}) {
  const [open, setOpen] = React.useState(false);

  const net = r2(owed - oweThem);
  const iOwe = net < -0.005; // you owe more than you're owed
  const magnitude = Math.abs(net);
  const hasOwed = reimbursables.length > 0 || debtors.length > 0;
  const hasOwe = creditors.length > 0;
  const hasItems = hasOwed || hasOwe;

  const label = iOwe ? "I owe" : "Owed to me";
  const accent: "positive" | "negative" | "default" =
    net > 0.005 ? "positive" : iOwe ? "negative" : "default";

  // Hint: when both sides are live, spell out the offset; otherwise a simple count.
  const hint = !hasItems
    ? "All settled"
    : hasOwed && hasOwe
      ? iOwe
        ? `${fmtMoney(owed)} owed to you nets it down`
        : `after ${fmtMoney(oweThem)} you owe`
      : hasOwe
        ? `Across ${creditors.length} ${creditors.length === 1 ? "person" : "people"}`
        : debtors.length && reimbursables.length
          ? `${debtors.length} ${debtors.length === 1 ? "person" : "people"} + ${reimbursables.length} reimbursable`
          : debtors.length
            ? `Across ${debtors.length} ${debtors.length === 1 ? "person" : "people"}`
            : `${fmtMoney(owed)} reimbursable`;

  return (
    <>
      <StatCard
        label={label}
        value={<CountUp value={magnitude} cents />}
        hint={hint}
        icon={iOwe ? <ArrowUpRight /> : <ArrowDownLeft />}
        accent={accent}
        iconClassName={iOwe ? "bg-negative" : undefined}
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Money between you and others</DialogTitle>
            <DialogDescription>
              What people owe you, and what you owe them. The KPI shows the net.
            </DialogDescription>
          </DialogHeader>

          {!hasItems ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing outstanding. All settled.</p>
          ) : (
            <div className="space-y-5">
              {hasOwed ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Owed to me</p>
                    <Money value={owed} cents className="text-sm font-semibold text-positive tnum" />
                  </div>
                  {reimbursables.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <HandCoins className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.description}</span>
                          <span className="text-xs text-muted-foreground">{fmtDate(r.date, "short")}</span>
                        </span>
                      </span>
                      <Money value={r.outstanding} cents className="shrink-0 font-medium tnum" />
                    </div>
                  ))}
                  {debtors.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{d.name}</span>
                          {d.note ? <span className="block truncate text-xs text-muted-foreground">{d.note}</span> : null}
                        </span>
                      </span>
                      <Money value={d.amount} cents className="shrink-0 font-medium tnum" />
                    </div>
                  ))}
                </div>
              ) : null}

              {hasOwe ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">I owe</p>
                    <Money value={oweThem} cents className="text-sm font-semibold text-negative tnum" />
                  </div>
                  {creditors.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.name}</span>
                          {c.note ? <span className="block truncate text-xs text-muted-foreground">{c.note}</span> : null}
                        </span>
                      </span>
                      <Money value={c.amount} cents className="shrink-0 font-medium tnum" />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-1 flex items-center justify-between border-t-2 border-border pt-3 text-sm font-semibold">
            <span>{iOwe ? "Net I owe" : "Net owed to me"}</span>
            <Money value={magnitude} cents colored={net > 0.005 ? true : false} className="tnum" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
