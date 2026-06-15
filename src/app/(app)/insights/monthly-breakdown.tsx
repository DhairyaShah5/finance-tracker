"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/money";
import { fmtDate } from "@/lib/format";

export interface MonthRow {
  month: string;
  label: string;
  needs: number;
  wants: number;
  savings: number;
  unclassified: number;
  total: number;
}
export type Group = "needs" | "wants" | "savings" | "unclassified";
export interface DetailItem {
  month: string;
  date: string;
  description: string;
  category: string | null;
  group: Group;
  amount: number;
}

const GROUPS: { key: Group; label: string; color: string }[] = [
  { key: "needs", label: "Needs", color: "var(--chart-1)" },
  { key: "wants", label: "Wants", color: "var(--chart-5)" },
  { key: "savings", label: "Savings", color: "var(--chart-2)" },
  { key: "unclassified", label: "Unclassified", color: "var(--muted-foreground)" },
];

export function MonthlyBreakdown({
  months,
  income,
  details,
}: {
  months: MonthRow[];
  income: Record<string, number>;
  details: DetailItem[];
}) {
  const [openMonth, setOpenMonth] = React.useState<string | null>(null);
  const selected = months.find((m) => m.month === openMonth) ?? null;
  const monthItems = openMonth ? details.filter((d) => d.month === openMonth) : [];

  return (
    <>
      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Needs</TableHead>
              <TableHead className="text-right">Wants</TableHead>
              <TableHead className="text-right">Savings</TableHead>
              <TableHead className="text-right">Total out</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Income</TableHead>
              <TableHead className="text-right">Split (N/W/S)</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.map((m) => {
              const cls = m.needs + m.wants + m.savings;
              const p = (n: number) => (cls > 0 ? Math.round((n / cls) * 100) : 0);
              return (
                <TableRow
                  key={m.month}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setOpenMonth(m.month)}
                >
                  <TableCell className="font-medium">{m.label}</TableCell>
                  <TableCell className="text-right"><Money value={m.needs} /></TableCell>
                  <TableCell className="text-right"><Money value={m.wants} /></TableCell>
                  <TableCell className="text-right"><Money value={m.savings} /></TableCell>
                  <TableCell className="text-right font-medium"><Money value={m.total} /></TableCell>
                  <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                    <Money value={income[m.month] ?? 0} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className="tnum text-[10px]">
                      {p(m.needs)}/{p(m.wants)}/{p(m.savings)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <ChevronRight className="size-4" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!openMonth} onOpenChange={(v) => !v && setOpenMonth(null)}>
        <DialogContent className="max-h-[82vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.label} — expense breakdown</DialogTitle>
            <DialogDescription>
              Check that each expense sits in the right group. Reassign a category in Settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {GROUPS.map((g) => {
              const items = monthItems
                .filter((d) => d.group === g.key)
                .sort((a, b) => b.amount - a.amount);
              if (!items.length) return null;
              const subtotal = items.reduce((s, i) => s + i.amount, 0);
              return (
                <div key={g.key}>
                  <div className="mb-1 flex items-center justify-between border-b border-border pb-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="size-2.5 rounded-full" style={{ background: g.color }} />
                      {g.label}
                    </span>
                    <Money value={subtotal} cents className="text-sm font-semibold" />
                  </div>
                  <div className="divide-y divide-border/60">
                    {items.map((d, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <div className="min-w-0">
                          <div className="truncate">{d.description}</div>
                          <div className="text-xs text-muted-foreground">
                            {d.category ?? "Uncategorized"} · {fmtDate(d.date, "short")}
                          </div>
                        </div>
                        <Money value={d.amount} cents className="shrink-0 tnum" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
