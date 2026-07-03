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
import { markReimbursed } from "./actions";

const today = todayISO;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function ReimburseDialog({
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
  const [date, setDate] = React.useState(today());
  const [description, setDescription] = React.useState("");

  const owed = transaction ? round2(transaction.amount - myAmount(transaction)) : 0;
  const already = round2(transaction?.reimbursed_amount ?? 0);
  const remaining = round2(Math.max(0, owed - already));

  React.useEffect(() => {
    if (!open) return;
    setAmount(remaining ? String(remaining) : "");
    setAccountId(transaction?.account_id ?? accounts[0]?.id ?? "");
    setDate(today());
    setDescription("");
  }, [open, transaction, accounts, remaining]);

  const amt = round2(Math.min(Number(amount) || 0, remaining));
  const leftAfter = round2(Math.max(0, remaining - amt));

  function submit() {
    if (!transaction) return;
    if (amt <= 0) {
      toast.error("Enter an amount to reimburse.");
      return;
    }
    if (!accountId) {
      toast.error("Pick an account.");
      return;
    }
    start(async () => {
      const res = await markReimbursed({
        transaction_id: transaction.id,
        account_id: accountId,
        amount: String(amt),
        txn_date: date,
        description: description.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to record reimbursement.");
        return;
      }
      toast.success(
        leftAfter > 0
          ? `Recorded ${fmtMoney(amt, { cents: true })}. ${fmtMoney(leftAfter, { cents: true })} still owed.`
          : `Fully reimbursed ${fmtMoney(owed, { cents: true })}.`,
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record reimbursement</DialogTitle>
          <DialogDescription>
            {transaction
              ? `You are owed ${fmtMoney(remaining, { cents: true })} back for "${transaction.description}"${already > 0 ? ` (${fmtMoney(already, { cents: true })} already returned)` : ""}. Record how much came back.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            This adds the amount to your account as returned money. It raises your balance but is not
            counted as income. Reimbursements can come in parts, so enter just what landed this time.
            If it arrived together with a paycheck, enter the paycheck for the salary portion only, so
            the two add up to the real deposit.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reimburse-amount">Amount received</Label>
              <Input
                id="reimburse-amount"
                type="number"
                step="0.01"
                min="0"
                max={remaining}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reimburse-date">Date received</Label>
              <Input
                id="reimburse-date"
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
            <Label htmlFor="reimburse-desc">Note</Label>
            <Input
              id="reimburse-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={transaction ? `Reimbursed: ${transaction.description}` : "e.g. Expensify payout"}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <span className="text-muted-foreground">After this</span>
            <span className={leftAfter > 0 ? "font-semibold tnum text-foreground" : "font-semibold tnum text-positive"}>
              {leftAfter > 0 ? `${fmtMoney(leftAfter, { cents: true })} still owed` : "Fully reimbursed"}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || amt <= 0}>
            {pending ? "Recording…" : "Record reimbursement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
