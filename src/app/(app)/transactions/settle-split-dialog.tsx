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
import { fmtMoney, todayISO } from "@/lib/format";
import { myAmount } from "@/lib/calc";
import type { AccountRow, TransactionRow } from "@/lib/database.types";
import { settleSplit } from "./actions";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function SettleSplitDialog({
  open,
  onOpenChange,
  transaction,
  accounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction: TransactionRow | null;
  accounts: AccountRow[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const [amount, setAmount] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [description, setDescription] = React.useState("");

  // Your current share is the most anyone can pay back here.
  const share = transaction ? myAmount(transaction) : 0;

  React.useEffect(() => {
    if (!open) return;
    setAmount("");
    setAccountId(transaction?.account_id ?? accounts[0]?.id ?? "");
    setDate(todayISO());
    setDescription("");
  }, [open, transaction, accounts]);

  const amt = round2(Math.min(Math.max(0, Number(amount) || 0), share));
  const newShare = round2(Math.max(0, share - amt));

  function submit() {
    if (!transaction) return;
    if (amt <= 0) {
      toast.error("Enter how much you got back.");
      return;
    }
    if (!accountId) {
      toast.error("Pick an account.");
      return;
    }
    start(async () => {
      const res = await settleSplit({
        transaction_id: transaction.id,
        account_id: accountId,
        amount: String(amt),
        txn_date: date,
        description: description.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to settle split.");
        return;
      }
      toast.success(
        `Settled ${fmtMoney(amt, { cents: true })}. Your share of "${transaction.description}" is now ${fmtMoney(newShare, { cents: true })}.`,
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settle a split</DialogTitle>
          <DialogDescription>
            {transaction
              ? `Someone paid you back their part of "${transaction.description}". Your share is ${fmtMoney(share, { cents: true })} - record how much came back.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            This adds the repayment to your account (raises your balance, but is not counted as income)
            and lowers your share of this expense by the same amount, so your spending reflects only
            what you actually covered. Don&apos;t also log the payment separately.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="settle-amount">You got back</Label>
              <Input
                id="settle-amount"
                type="number"
                step="0.01"
                min="0"
                max={share}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settle-date">Date received</Label>
              <Input
                id="settle-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Into account</Label>
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
            <Label htmlFor="settle-desc">Note</Label>
            <Input
              id="settle-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={transaction ? `Split settled: ${transaction.description}` : "e.g. Raghav Splitwise settlement"}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <span className="text-muted-foreground">Your share after this</span>
            <span className="font-semibold tnum text-foreground">
              {fmtMoney(share, { cents: true })} → {fmtMoney(newShare, { cents: true })}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || amt <= 0}>
            {pending ? "Settling…" : "Settle split"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
