"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { sumOwed, sumOwedByMe, type DebtorBalance, type CreditorBalance } from "@/lib/calc";
import type { AccountRow, CategoryRow, DebtorRow, CreditorRow } from "@/lib/database.types";
import { useReadOnly } from "@/components/read-only-context";
import { DebtorDialog } from "./debtor-dialog";
import { SettleDialog } from "./settle-dialog";
import { CreditorDialog } from "./creditor-dialog";
import { RepayDialog } from "./repay-dialog";
import { deleteDebtor, deleteCreditor } from "./actions";

const VIEW_ONLY = "View only - sign in to make changes.";

export function PeopleView({
  debtorBalances,
  creditorBalances,
  accounts,
  categories,
}: {
  debtorBalances: DebtorBalance[];
  creditorBalances: CreditorBalance[];
  accounts: AccountRow[];
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const readOnly = useReadOnly();

  // Owed-to-me (debtor) dialog state
  const [debtorOpen, setDebtorOpen] = React.useState(false);
  const [editingDebtor, setEditingDebtor] = React.useState<DebtorRow | null>(null);
  const [settleOpen, setSettleOpen] = React.useState(false);
  const [settling, setSettling] = React.useState<DebtorBalance | null>(null);

  // I-owe (creditor) dialog state
  const [creditorOpen, setCreditorOpen] = React.useState(false);
  const [editingCreditor, setEditingCreditor] = React.useState<CreditorRow | null>(null);
  const [repayOpen, setRepayOpen] = React.useState(false);
  const [repaying, setRepaying] = React.useState<CreditorBalance | null>(null);

  const owed = sumOwed(debtorBalances);
  const oweThem = sumOwedByMe(creditorBalances);
  const debtors = debtorBalances.map((b) => b.debtor);
  const creditors = creditorBalances.map((b) => b.creditor);

  function guard(fn: () => void) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    fn();
  }

  function onDeleteDebtor(d: DebtorRow) {
    guard(() => {
      if (!window.confirm(`Delete "${d.name}"?`)) return;
      deleteDebtor(d.id).then((res) => {
        if (!res.ok) toast.error(res.error ?? "Failed to delete.");
        else {
          toast.success("Debtor deleted.");
          router.refresh();
        }
      });
    });
  }

  function onDeleteCreditor(c: CreditorRow) {
    guard(() => {
      if (!window.confirm(`Delete "${c.name}"?`)) return;
      deleteCreditor(c.id).then((res) => {
        if (!res.ok) toast.error(res.error ?? "Failed to delete.");
        else {
          toast.success("Creditor deleted.");
          router.refresh();
        }
      });
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        description="Money between you and other people - what they owe you, and what you owe them."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label="Owed to me"
          value={<Money value={owed} cents />}
          hint={debtors.length ? `Across ${debtors.length} ${debtors.length === 1 ? "person" : "people"}` : "All settled"}
          icon={<ArrowDownLeft className="size-4" />}
          accent={owed > 0 ? "positive" : "default"}
        />
        <StatCard
          label="I owe"
          value={<Money value={oweThem} cents />}
          hint={creditors.length ? `Across ${creditors.length} ${creditors.length === 1 ? "person" : "people"}` : "All settled"}
          icon={<ArrowUpRight className="size-4" />}
          accent={oweThem > 0 ? "negative" : "default"}
          iconClassName={oweThem > 0 ? "bg-negative" : undefined}
        />
      </div>

      {/* ---- Owed to me (debtors) ---- */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Owed to me</CardTitle>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => guard(() => { setEditingDebtor(null); setDebtorOpen(true); })}>
            <Plus className="size-4" /> Add debtor
          </Button>
        </CardHeader>
        {debtors.length === 0 ? (
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <Users className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No one owes you right now. Add someone when you front money for them.</p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Note</TableHead>
                <TableHead className="text-right">Owes me</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {debtorBalances.map(({ debtor: d, outstanding }) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="hidden max-w-[32ch] truncate text-sm text-muted-foreground sm:table-cell">
                    {d.note?.trim() ? d.note : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={outstanding} cents colored={outstanding > 0} className="font-medium" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {outstanding > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5"
                          onClick={() => guard(() => { setSettling({ debtor: d, outstanding }); setSettleOpen(true); })}
                        >
                          <HandCoins className="size-3.5" /> Settle up
                        </Button>
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-positive">Settled</span>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {outstanding > 0 ? (
                            <DropdownMenuItem onClick={() => guard(() => { setSettling({ debtor: d, outstanding }); setSettleOpen(true); })}>
                              <HandCoins className="size-4" /> Settle up
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onClick={() => guard(() => { setEditingDebtor(d); setDebtorOpen(true); })}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => onDeleteDebtor(d)}>
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* ---- I owe (creditors) ---- */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">I owe</CardTitle>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => guard(() => { setEditingCreditor(null); setCreditorOpen(true); })}>
            <Plus className="size-4" /> Add creditor
          </Button>
        </CardHeader>
        {creditors.length === 0 ? (
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <Users className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">You don&apos;t owe anyone right now. Add someone when you take money you&apos;ll pay back.</p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Note</TableHead>
                <TableHead className="text-right">I owe</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditorBalances.map(({ creditor: c, outstanding }) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="hidden max-w-[32ch] truncate text-sm text-muted-foreground sm:table-cell">
                    {c.note?.trim() ? c.note : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={outstanding} cents colored={outstanding > 0} className="font-medium" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {outstanding > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5"
                          onClick={() => guard(() => { setRepaying({ creditor: c, outstanding }); setRepayOpen(true); })}
                        >
                          <HandCoins className="size-3.5" /> Pay back
                        </Button>
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-positive">Paid off</span>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {outstanding > 0 ? (
                            <DropdownMenuItem onClick={() => guard(() => { setRepaying({ creditor: c, outstanding }); setRepayOpen(true); })}>
                              <HandCoins className="size-4" /> Pay back
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onClick={() => guard(() => { setEditingCreditor(c); setCreditorOpen(true); })}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => onDeleteCreditor(c)}>
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <DebtorDialog
        open={debtorOpen}
        onOpenChange={setDebtorOpen}
        existing={editingDebtor}
        accounts={accounts}
        categories={categories}
      />
      <SettleDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        debtor={settling?.debtor ?? null}
        owed={settling?.outstanding ?? 0}
        accounts={accounts}
      />
      <CreditorDialog
        open={creditorOpen}
        onOpenChange={setCreditorOpen}
        existing={editingCreditor}
        accounts={accounts}
        categories={categories}
      />
      <RepayDialog
        open={repayOpen}
        onOpenChange={setRepayOpen}
        creditor={repaying?.creditor ?? null}
        owed={repaying?.outstanding ?? 0}
        accounts={accounts}
      />
    </div>
  );
}
