"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  CreditCard,
  Landmark,
  LineChart,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { DonutBreakdown } from "@/components/donut-breakdown";
import { hueColor } from "@/lib/format";
import type { AccountActivity } from "@/lib/calc";
import { useReadOnly } from "@/components/read-only-context";
import { AccountDialog } from "./account-dialog";
import { TransferDialog, type TransferPreset } from "./transfer-dialog";
import { deleteAccount } from "./actions";

const VIEW_ONLY = "View only - sign in to make changes.";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface BreakdownRow {
  name: string;
  sub: string;
  value: number;
}
interface Breakdown {
  title: string;
  explain: string;
  rows: BreakdownRow[];
  total: number;
  colored: boolean;
}

export function AccountsView({ activity }: { activity: AccountActivity[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountActivity | null>(null);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [transferPreset, setTransferPreset] = React.useState<TransferPreset | null>(null);
  const [breakdown, setBreakdown] = React.useState<Breakdown | null>(null);
  const readOnly = useReadOnly();

  function onTransfer() {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setTransferPreset(null);
    setTransferOpen(true);
  }
  function onPayoff(a: AccountActivity) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    if (a.balance === 0) {
      toast.info(`${a.account.name} is already at $0.`);
      return;
    }
    // Settle the card to 0. Debt (negative balance) → pay FROM a cash account
    // INTO the card. Credit (positive balance) → move FROM the card to cash.
    const cash = activity.find((x) => !x.account.is_credit && x.account.include_in_net_worth);
    if (a.balance < 0) {
      setTransferPreset({
        fromAccountId: cash?.account.id,
        toAccountId: a.account.id,
        amount: round2(-a.balance),
        note: `${a.account.name} payment`,
      });
    } else {
      setTransferPreset({
        fromAccountId: a.account.id,
        toAccountId: cash?.account.id,
        amount: round2(a.balance),
        note: `${a.account.name} credit refund`,
      });
    }
    setTransferOpen(true);
  }

  const included = activity.filter((a) => a.account.include_in_net_worth);
  const netWorth = included.reduce((s, a) => s + a.balance, 0);
  const assets = activity.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const liabilities = activity.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);

  const rowOf = (a: AccountActivity): BreakdownRow => ({
    name: a.account.name,
    sub: `${a.account.bank} · ${a.account.type.replace("_", " ")}`,
    value: a.balance,
  });
  function showNetWorth() {
    setBreakdown({
      title: "Net worth",
      explain:
        "Balances of every account counted toward net worth. Accounts marked “Excluded” (like a savings stash) are left out.",
      rows: included.map(rowOf).sort((a, b) => b.value - a.value),
      total: netWorth,
      colored: true,
    });
  }
  function showAssets() {
    setBreakdown({
      title: "Assets",
      explain:
        "Every account with a positive balance: cash, checking & savings. Includes excluded accounts like Marcus HYSA.",
      rows: activity.filter((a) => a.balance > 0).map(rowOf).sort((a, b) => b.value - a.value),
      total: assets,
      colored: false,
    });
  }
  function showOwed() {
    setBreakdown({
      title: "What you owe",
      explain: "Credit cards and any account carrying a negative balance.",
      rows: activity.filter((a) => a.balance < 0).map(rowOf).sort((a, b) => a.value - b.value),
      total: liabilities,
      colored: true,
    });
  }

  const donut = activity
    .filter((a) => a.balance > 0)
    .map((a, i) => ({ name: a.account.name, value: a.balance, color: hueColor(210 + i * 28) }));

  function onAdd() {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setEditing(null);
    setDialogOpen(true);
  }
  function onEdit(a: AccountActivity) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setEditing(a);
    setDialogOpen(true);
  }
  function onDelete(a: AccountActivity) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    if (!window.confirm(`Delete "${a.account.name}"?`)) return;
    deleteAccount(a.account.id).then((res) => {
      if (!res.ok) toast.error(res.error ?? "Failed to delete.");
      else {
        toast.success("Account deleted.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Live balances across every bank, card, and cash stash."
        actions={
          <>
            <Button variant="ghost" onClick={() => router.push("/accounts/import")} className="gap-1.5">
              <Upload className="size-4" /> Import
            </Button>
            <Button variant="outline" onClick={onTransfer} className="gap-1.5">
              <ArrowRightLeft className="size-4" /> Transfer
            </Button>
            <Button onClick={onAdd} className="gap-1.5">
              <Plus className="size-4" /> Add account
            </Button>
          </>
        }
      />

      {/* Net worth hero + breakdown */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Net worth"
          value={<Money value={netWorth} cents colored />}
          hint="Across accounts in net worth · click to see how"
          icon={<Wallet className="size-4" />}
          onClick={showNetWorth}
        />
        <StatCard
          label="Assets"
          value={<Money value={assets} cents />}
          hint="Cash, checking & savings · click to see how"
          accent="positive"
          onClick={showAssets}
        />
        <StatCard
          label="What you owe"
          value={<Money value={liabilities} cents />}
          hint="Credit card balances · click to see how"
          accent={liabilities < 0 ? "negative" : "default"}
          onClick={showOwed}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Per-account cards */}
        <div className="space-y-3 lg:col-span-3">
          {activity.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Landmark className="size-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">No accounts yet</p>
                  <p className="text-sm text-muted-foreground">Add a bank, card, or cash account.</p>
                </div>
                <Button onClick={onAdd} variant="outline" className="gap-1.5">
                  <Plus className="size-4" /> Add account
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {activity.map((a) => {
                const credit = a.account.is_credit || a.account.type === "credit_card";
                const invest = a.account.type === "investment";
                return (
                  <Card key={a.account.id} className="gap-0 py-0">
                    <CardContent className="flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-9 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                            {credit ? (
                              <CreditCard className="size-4" />
                            ) : invest ? (
                              <LineChart className="size-4" />
                            ) : (
                              <Landmark className="size-4" />
                            )}
                          </span>
                          <div>
                            <p className="text-sm font-medium leading-tight">{a.account.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {a.account.bank} · {a.account.type.replace("_", " ")}
                            </p>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7 -mr-1 -mt-1">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(a)}>
                              <Pencil className="size-4" /> Edit balance
                            </DropdownMenuItem>
                            {credit ? (
                              <DropdownMenuItem onClick={() => onPayoff(a)}>
                                <ArrowRightLeft className="size-4" /> Pay off
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem variant="destructive" onClick={() => onDelete(a)}>
                              <Trash2 className="size-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div>
                        <Money
                          value={a.balance}
                          cents
                          colored={credit || a.balance < 0}
                          className="text-2xl font-semibold"
                        />
                        {!a.account.include_in_net_worth ? (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-[10px]">Excluded</Badge>
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Composition */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Where your money sits</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutBreakdown data={donut} height={220} centerLabel="Assets" emptyText="No positive balances to chart." />
          </CardContent>
        </Card>
      </div>

      <AccountDialog open={dialogOpen} onOpenChange={setDialogOpen} existing={editing} />
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        accounts={activity}
        preset={transferPreset}
      />

      <Dialog open={!!breakdown} onOpenChange={(v) => !v && setBreakdown(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{breakdown?.title}</DialogTitle>
            <DialogDescription>{breakdown?.explain}</DialogDescription>
          </DialogHeader>
          {breakdown ? (
            <div>
              {breakdown.rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing here. Every balance is zero{breakdown.title === "What you owe" ? " or positive" : ""}.
                </p>
              ) : (
                <div className="divide-y divide-border/60">
                  {breakdown.rows.map((r) => (
                    <div key={r.name} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="truncate text-xs capitalize text-muted-foreground">{r.sub}</p>
                      </div>
                      <Money
                        value={r.value}
                        cents
                        colored={breakdown.colored}
                        className="shrink-0 text-sm font-medium tnum"
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-1 flex items-center justify-between gap-3 border-t-2 border-border pt-2.5">
                <span className="text-sm font-semibold">{breakdown.title}</span>
                <Money
                  value={breakdown.total}
                  cents
                  colored={breakdown.colored}
                  className="shrink-0 text-base font-semibold tnum"
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
