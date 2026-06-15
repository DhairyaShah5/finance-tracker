"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark, MoreHorizontal, Pencil, Plus, Trash2, Wallet } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { DonutChart } from "@/components/charts";
import { hueColor } from "@/lib/format";
import type { AccountActivity } from "@/lib/calc";
import type { AccountRow } from "@/lib/database.types";
import { AccountDialog } from "./account-dialog";
import { deleteAccount } from "./actions";

const TYPE_LABELS: Record<AccountRow["type"], string> = {
  checking: "Checking",
  credit_card: "Credit card",
  debit_card: "Debit card",
  savings: "Savings",
  cash: "Cash",
};

export function AccountsView({ activity }: { activity: AccountActivity[] }) {
  const router = useRouter();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountRow | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const totals = React.useMemo(() => {
    let balance = 0;
    let inflow = 0;
    let outflow = 0;
    for (const a of activity) {
      balance += a.balance;
      inflow += a.inflow;
      outflow += a.outflow;
    }
    return { balance, inflow, outflow };
  }, [activity]);

  const donut = React.useMemo(
    () =>
      activity
        .filter((a) => a.balance > 0)
        .map((a, i) => ({
          name: a.account.name,
          value: a.balance,
          color: hueColor(220 + i * 30),
        })),
    [activity],
  );

  const nextOrder = React.useMemo(
    () =>
      activity.length
        ? Math.max(...activity.map((a) => a.account.display_order)) + 1
        : 0,
    [activity],
  );

  function onAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function onEdit(account: AccountRow) {
    setEditing(account);
    setDialogOpen(true);
  }
  function onDelete(account: AccountRow) {
    if (!window.confirm(`Delete "${account.name}"?`)) return;
    setPendingId(account.id);
    deleteAccount(account.id)
      .then((res) => {
        if (!res.ok) toast.error(res.error ?? "Failed to delete.");
        else {
          toast.success("Account deleted.");
          router.refresh();
        }
      })
      .finally(() => setPendingId(null));
  }

  const empty = activity.length === 0;

  const addButton = (
    <Button onClick={onAdd} className="gap-1.5">
      <Plus className="size-4" /> Add account
    </Button>
  );

  if (empty) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Accounts"
          description="Track balances across every bank, card, and cash stash."
          actions={addButton}
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Wallet className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No accounts yet</p>
              <p className="text-sm text-muted-foreground">
                Add a bank, card, or cash account to start tracking balances.
              </p>
            </div>
            <Button onClick={onAdd} className="mt-1 gap-1.5">
              <Plus className="size-4" /> Add account
            </Button>
          </CardContent>
        </Card>
        <AccountDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          existing={editing}
          nextOrder={nextOrder}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Track balances across every bank, card, and cash stash."
        actions={addButton}
      />

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total balance"
          value={<Money value={totals.balance} colored />}
          hint="Across all accounts"
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Total in"
          value={<Money value={totals.inflow} />}
          accent="positive"
        />
        <StatCard
          label="Total out"
          value={<Money value={totals.outflow} />}
          accent="negative"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Accounts table */}
        <Card className="overflow-hidden py-0 lg:col-span-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Opening</TableHead>
                <TableHead className="hidden text-right sm:table-cell">In</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Out</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.map(({ account, inflow, outflow, balance }) => (
                <TableRow key={account.id} data-pending={pendingId === account.id || undefined}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                        <Landmark className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{account.name}</span>
                          {account.is_credit ? (
                            <Badge variant="outline" className="text-[10px]">
                              credit
                            </Badge>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground">{account.bank}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="secondary" className="font-normal">
                      {TYPE_LABELS[account.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
                    <Money value={account.opening_balance} />
                  </TableCell>
                  <TableCell className="hidden text-right sm:table-cell">
                    <Money value={inflow} className="text-positive" />
                  </TableCell>
                  <TableCell className="hidden text-right sm:table-cell">
                    <Money value={outflow} className="text-negative" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={balance} colored={account.is_credit} className="font-medium" />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(account)}>
                          <Pencil className="size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDelete(account)}
                          disabled={pendingId === account.id}
                        >
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Where money sits */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Where money sits</CardTitle>
          </CardHeader>
          <CardContent>
            {donut.length > 0 ? (
              <DonutChart data={donut} />
            ) : (
              <div className="flex h-60 flex-col items-center justify-center gap-2 text-center">
                <Wallet className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No accounts with a positive balance yet.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existing={editing}
        nextOrder={nextOrder}
      />
    </div>
  );
}
