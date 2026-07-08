"use client";

import * as React from "react";
import { Users, HandCoins, UserRound } from "lucide-react";
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
import { fmtDate } from "@/lib/format";

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

/** "Owed to me" KPI that opens an itemized breakdown: money fronted on
 *  reimbursable expenses plus people who owe you. Derived from the ledger. */
export function OwedCard({
  total,
  reimbursables,
  debtors,
  hint,
}: {
  total: number;
  reimbursables: OwedReimbursable[];
  debtors: OwedDebtor[];
  hint: string;
}) {
  const [open, setOpen] = React.useState(false);
  const hasItems = reimbursables.length > 0 || debtors.length > 0;
  return (
    <>
      <StatCard
        label="Owed to me"
        value={<CountUp value={total} cents />}
        hint={hint}
        icon={<Users />}
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Owed to me</DialogTitle>
            <DialogDescription>
              Money coming back to you: reimbursable expenses you fronted, plus people who owe you.
            </DialogDescription>
          </DialogHeader>

          {!hasItems ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing outstanding. All settled.</p>
          ) : (
            <div className="space-y-4">
              {reimbursables.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Reimbursable expenses
                  </p>
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
                </div>
              ) : null}

              {debtors.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">People</p>
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
            </div>
          )}

          <div className="mt-1 flex items-center justify-between border-t-2 border-border pt-3 text-sm font-semibold">
            <span>Total owed to me</span>
            <Money value={total} cents className="tnum" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
