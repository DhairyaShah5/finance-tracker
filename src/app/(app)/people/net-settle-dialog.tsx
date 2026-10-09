"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Money } from "@/components/money";
import { fmtMoney, todayISO } from "@/lib/format";
import type { AccountRow } from "@/lib/database.types";
import { settleUpBalance } from "./actions";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type NetSettleTarget = {
  name: string;
  debtorId: string | null;
  creditorId: string | null;
  owed: number; // they owe you
  oweThem: number; // you owe them
};

export function NetSettleDialog({
  open,
  onOpenChange,
  target,
  accounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: NetSettleTarget | null;
  accounts: AccountRow[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [accountId, setAccountId] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [description, setDescription] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setAccountId(accounts[0]?.id ?? "");
    setDate(todayISO());
    setDescription("");
  }, [open, accounts]);

  const owed = target?.owed ?? 0;
  const oweThem = target?.oweThem ?? 0;
  const net = round2(oweThem - owed); // > 0 you pay, < 0 they pay you
  const youPay = net > 0.005;
  const theyPay = net < -0.005;
  const even = !youPay && !theyPay;

  function submit() {
    if (!target) return;
    if (!even && !accountId) return void toast.error("Pick an account for the difference.");
    start(async () => {
      const res = await settleUpBalance({
        debtor_id: target.debtorId,
        creditor_id: target.creditorId,
        account_id: even ? null : accountId,
        txn_date: even ? null : date,
        description: description.trim() || null,
      });
      if (!res.ok) return void toast.error(res.error ?? "Failed to settle.");
      toast.success(`All settled up with ${target.name}.`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settle up{target ? ` with ${target.name}` : ""}</DialogTitle>
          <DialogDescription>
            This squares up both sides at once. You only move the difference.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">They owe you</span>
              <Money value={owed} cents className="tnum font-medium" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">You owe them</span>
              <Money value={oweThem} cents className="tnum font-medium" />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="font-medium">
                {youPay ? "You pay" : theyPay ? "They pay you" : "All even"}
              </span>
              <span className={youPay ? "font-semibold tnum text-negative" : theyPay ? "font-semibold tnum text-positive" : "font-semibold tnum"}>
                {even ? fmtMoney(0, { cents: true }) : fmtMoney(Math.abs(net), { cents: true })}
              </span>
            </div>
          </div>

          {even ? (
            <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              Both sides cancel out exactly - no money needs to change hands. Confirming just clears them both.
            </p>
          ) : (
            <>
              <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                {youPay
                  ? `What they owe you cancels part of what you owe them; you pay the ${fmtMoney(Math.abs(net), { cents: true })} difference. It's the only money that moves.`
                  : `What you owe them cancels part of what they owe you; they pay you the ${fmtMoney(Math.abs(net), { cents: true })} difference. It's the only money that moves.`}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{youPay ? "From account" : "Into account"}</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="net-date">Date</Label>
                  <Input id="net-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="net-desc">Note</Label>
                <Input
                  id="net-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Venmo"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Settling…" : even ? "Clear both" : "Settle up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
