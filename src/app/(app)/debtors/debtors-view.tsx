"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandCoins, MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react";
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
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { sumOwed } from "@/lib/calc";
import type { AccountRow, DebtorRow } from "@/lib/database.types";
import { useReadOnly } from "@/components/read-only-context";
import { DebtorDialog } from "./debtor-dialog";
import { SettleDialog } from "./settle-dialog";
import { deleteDebtor } from "./actions";

const VIEW_ONLY = "View only - sign in to make changes.";

export function DebtorsView({
  debtors,
  accounts,
}: {
  debtors: DebtorRow[];
  accounts: AccountRow[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DebtorRow | null>(null);
  const [settleOpen, setSettleOpen] = React.useState(false);
  const [settling, setSettling] = React.useState<DebtorRow | null>(null);

  const owed = sumOwed(debtors);
  const readOnly = useReadOnly();

  function onAdd() {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setEditing(null);
    setDialogOpen(true);
  }
  function onEdit(d: DebtorRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setEditing(d);
    setDialogOpen(true);
  }
  function onSettle(d: DebtorRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setSettling(d);
    setSettleOpen(true);
  }
  function onDelete(d: DebtorRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    if (!window.confirm(`Delete "${d.name}"?`)) return;
    deleteDebtor(d.id).then((res) => {
      if (!res.ok) toast.error(res.error ?? "Failed to delete.");
      else {
        toast.success("Debtor deleted.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Debtors"
        description="People who owe you money. Track the outstanding amounts."
        actions={
          <Button onClick={onAdd} className="gap-1.5">
            <Plus className="size-4" /> Add debtor
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total owed to me"
          value={<Money value={owed} cents />}
          hint={debtors.length ? `Across ${debtors.length} debtor${debtors.length === 1 ? "" : "s"}` : "All settled"}
          icon={<Users className="size-4" />}
          accent={owed > 0 ? "positive" : "default"}
        />
      </div>

      {debtors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No debtors</p>
              <p className="text-sm text-muted-foreground">
                Everyone&apos;s settled up. Add someone when they owe you money.
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
                <TableHead className="hidden sm:table-cell">Note</TableHead>
                <TableHead className="text-right">Owes</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {debtors.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="hidden max-w-[32ch] truncate text-sm text-muted-foreground sm:table-cell">
                    {d.note?.trim() ? d.note : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={d.amount} cents colored={d.amount > 0} className="font-medium" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {d.amount > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5"
                          onClick={() => onSettle(d)}
                        >
                          <HandCoins className="size-3.5" /> Settle up
                        </Button>
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-positive">
                          Settled
                        </span>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {d.amount > 0 ? (
                            <DropdownMenuItem onClick={() => onSettle(d)}>
                              <HandCoins className="size-4" /> Settle up
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onClick={() => onEdit(d)}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => onDelete(d)}>
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
        </Card>
      )}

      <DebtorDialog open={dialogOpen} onOpenChange={setDialogOpen} existing={editing} />
      <SettleDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        debtor={settling}
        accounts={accounts}
      />
    </div>
  );
}
