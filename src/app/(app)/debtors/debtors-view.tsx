"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { fmtMoney } from "@/lib/format";
import { debtorBalances, totalOwedToMe } from "@/lib/calc";
import type { DebtorRow, InflowTypeRow, TransactionRow } from "@/lib/database.types";
import { DebtorDialog } from "./debtor-dialog";
import { deleteDebtor } from "./actions";

export function DebtorsView({
  debtors,
  transactions,
  inflowTypes,
}: {
  debtors: DebtorRow[];
  transactions: TransactionRow[];
  inflowTypes: InflowTypeRow[];
}) {
  const router = useRouter();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DebtorRow | null>(null);

  const balances = React.useMemo(
    () => debtorBalances(transactions, debtors, inflowTypes),
    [transactions, debtors, inflowTypes],
  );
  const owed = React.useMemo(
    () => totalOwedToMe(transactions, inflowTypes),
    [transactions, inflowTypes],
  );

  // Count of attributed transactions per debtor.
  const txnCountByDebtor = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) {
      if (!t.debtor_id) continue;
      m.set(t.debtor_id, (m.get(t.debtor_id) ?? 0) + 1);
    }
    return m;
  }, [transactions]);

  // Unassigned split outflows: money fronted (whose_expense != "My") with no debtor.
  const unassigned = React.useMemo(() => {
    const rows = transactions.filter(
      (t) =>
        t.direction === "outflow" &&
        t.whose_expense !== null &&
        t.whose_expense !== "My" &&
        t.debtor_id === null,
    );
    const sum = rows.reduce((s, t) => s + t.amount, 0);
    return { count: rows.length, sum };
  }, [transactions]);

  function onAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function onEdit(d: DebtorRow) {
    setEditing(d);
    setDialogOpen(true);
  }
  function onDelete(d: DebtorRow) {
    const attributed = txnCountByDebtor.get(d.id) ?? 0;
    const msg = attributed
      ? `Delete "${d.name}"? ${attributed} attributed transaction${attributed === 1 ? "" : "s"} will be unassigned.`
      : `Delete "${d.name}"?`;
    if (!window.confirm(msg)) return;
    deleteDebtor(d.id).then((res) => {
      if (!res.ok) toast.error(res.error ?? "Failed to delete.");
      else {
        toast.success("Debtor deleted.");
        router.refresh();
      }
    });
  }

  const hasDebtors = balances.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Debtors"
        description="People you've fronted money for — track what's been paid back."
        actions={
          <Button onClick={onAdd} className="gap-1.5">
            <Plus className="size-4" /> Add debtor
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Outstanding"
          value={<Money value={owed.outstanding} />}
          hint="Fronted minus reimbursed"
          icon={<Users className="size-4" />}
          accent={owed.outstanding > 0 ? "positive" : "default"}
        />
        <StatCard
          label="Total fronted"
          value={<Money value={owed.fronted} />}
          hint="Split expenses you covered"
          icon={<ArrowUpFromLine className="size-4" />}
        />
        <StatCard
          label="Total reimbursed"
          value={<Money value={owed.reimbursed} />}
          hint="Repayments received"
          icon={<ArrowDownToLine className="size-4" />}
        />
      </div>

      {/* Unassigned splits notice */}
      {unassigned.count > 0 ? (
        <Card className="border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="space-y-0.5 text-sm">
              <p className="font-medium">
                {unassigned.count} unassigned split{unassigned.count === 1 ? "" : "s"} ·{" "}
                {fmtMoney(unassigned.sum)}
              </p>
              <p className="text-muted-foreground">
                These are expenses fronted for someone but not yet attributed to a debtor.
                Assign them on the{" "}
                <Link
                  href="/transactions"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Transactions page
                </Link>{" "}
                so they count toward a balance.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Debtor table / empty state */}
      {!hasDebtors ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No debtors yet</p>
              <p className="text-sm text-muted-foreground">
                Add someone you front money for to start tracking what they owe you.
              </p>
            </div>
            <Button onClick={onAdd} variant="outline" className="gap-1.5">
              <Plus className="size-4" /> Add debtor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Note</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Fronted</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Repaid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.map(({ debtor, fronted, repaid, outstanding }) => {
                const count = txnCountByDebtor.get(debtor.id) ?? 0;
                return (
                  <TableRow key={debtor.id}>
                    <TableCell>
                      <div className="font-medium">{debtor.name}</div>
                      {count > 0 ? (
                        <Badge variant="outline" className="mt-0.5 text-[10px]">
                          {count} txn{count === 1 ? "" : "s"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No transactions</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-[28ch] truncate text-sm text-muted-foreground md:table-cell">
                      {debtor.note?.trim() ? debtor.note : "—"}
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      <Money value={fronted} className="text-sm" />
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      <Money value={repaid} className="text-sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money
                        value={outstanding}
                        colored={outstanding !== 0}
                        className="font-medium"
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(debtor)}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => onDelete(debtor)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {hasDebtors ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {balances.length} debtor{balances.length === 1 ? "" : "s"}
          </span>
          <span>
            Outstanding{" "}
            <Money value={owed.outstanding} colored className="font-medium" />
          </span>
        </div>
      ) : null}

      <DebtorDialog open={dialogOpen} onOpenChange={setDialogOpen} existing={editing} />
    </div>
  );
}
