"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/money";
import { fmtDate, fmtMoney } from "@/lib/format";
import { setTransactionBudgetGroup } from "../transactions/actions";

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
  id: string;
  month: string;
  date: string;
  description: string;
  category: string | null;
  group: Group;
  amount: number; // your share
  full: number; // full transaction amount
  split: number | null;
}

const NONE = "__none__";
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
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [openMonth, setOpenMonth] = React.useState<string | null>(null);
  const selected = months.find((m) => m.month === openMonth) ?? null;
  const monthItems = openMonth ? details.filter((d) => d.month === openMonth) : [];

  function changeGroup(id: string, value: string) {
    start(async () => {
      const res = await setTransactionBudgetGroup(
        id,
        value === NONE ? null : (value as "needs" | "wants" | "savings"),
      );
      if (!res.ok) toast.error(res.error ?? "Failed to classify.");
      else {
        toast.success("Classification updated.");
        router.refresh();
      }
    });
  }

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
        <DialogContent className="max-h-[82vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selected?.label} — expense breakdown</DialogTitle>
            <DialogDescription>
              Set each expense as Needs, Wants, or Savings — you decide per transaction.
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
                    {items.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 py-1.5 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{d.description}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDate(d.date, "short")}
                            {d.category ? ` · ${d.category}` : ""}
                            {d.split ? ` · your share of ${fmtMoney(d.full, { cents: true })} (÷${d.split})` : ""}
                          </div>
                        </div>
                        <Select
                          value={d.group === "unclassified" ? NONE : d.group}
                          onValueChange={(v) => changeGroup(d.id, v)}
                          disabled={pending}
                        >
                          <SelectTrigger className="h-7 w-32 shrink-0 text-xs">
                            <SelectValue placeholder="Unclassified" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Unclassified</SelectItem>
                            <SelectItem value="needs">Needs</SelectItem>
                            <SelectItem value="wants">Wants</SelectItem>
                            <SelectItem value="savings">Savings</SelectItem>
                          </SelectContent>
                        </Select>
                        <Money value={d.amount} cents className="w-20 shrink-0 text-right tnum" />
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
