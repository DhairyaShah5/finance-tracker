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
import { cn } from "@/lib/utils";
import type { AccountRow, CreditorRow } from "@/lib/database.types";
import { repayCreditor, type RepayInput } from "./actions";

const today = todayISO;

export function RepayDialog({
  open,
  onOpenChange,
  creditor,
  owed,
  accounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creditor: CreditorRow | null;
  owed: number; // derived outstanding balance for this creditor
  accounts: AccountRow[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const [amount, setAmount] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [description, setDescription] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setAmount(owed ? String(owed) : "");
    setAccountId(accounts[0]?.id ?? "");
    setDate(today());
    setDescription("");
  }, [open, owed, accounts]);

  const amt = Math.min(Number(amount) || 0, owed);
  const remaining = Math.max(0, Math.round((owed - amt) * 100) / 100);

  function submit() {
    if (!creditor) return;
    if (amt <= 0) {
      toast.error("Enter an amount to settle.");
      return;
    }
    if (!accountId) {
      toast.error("Pick an account.");
      return;
    }
    const input: RepayInput = {
      creditor_id: creditor.id,
      amount: String(amt),
      account_id: accountId,
      txn_date: date,
      description: description.trim() || null,
    };
    start(async () => {
      const res = await repayCreditor(input);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to record repayment.");
        return;
      }
      toast.success(
        remaining > 0
          ? `Repaid ${fmtMoney(amt, { cents: true })} to ${creditor.name}. ${fmtMoney(remaining, { cents: true })} left.`
          : `All paid off with ${creditor.name}.`,
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settle up{creditor ? ` with ${creditor.name}` : ""}</DialogTitle>
          <DialogDescription>
            {creditor ? `You currently owe ${creditor.name} ${fmtMoney(owed, { cents: true })}.` : ""} Record the
            money you paid them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            The money leaves your account but isn&apos;t counted as spending - it&apos;s clearing a debt. Covering
            one of their expenses instead of paying cash is the same thing; just note what it was for.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="repay-amount">Amount</Label>
              <Input
                id="repay-amount"
                type="number"
                step="0.01"
                min="0"
                max={owed}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repay-date">Date</Label>
              <Input id="repay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>From account</Label>
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
            <Label htmlFor="repay-desc">Note</Label>
            <Input
              id="repay-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Venmo"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <span className="text-muted-foreground">After this</span>
            <span className={cn("font-semibold tnum", remaining > 0 ? "text-foreground" : "text-positive")}>
              {remaining > 0 ? `${fmtMoney(remaining, { cents: true })} still owed` : "All paid off"}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || amt <= 0}>
            {pending ? "Settling…" : "Settle up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
