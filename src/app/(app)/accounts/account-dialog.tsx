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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/defaults";
import type { AccountActivity } from "@/lib/calc";
import { createAccount, updateAccount, type AccountInput } from "./actions";

const TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  credit_card: "Credit card",
  debit_card: "Debit card",
  savings: "Savings",
  cash: "Cash",
  investment: "Investment",
};

export function AccountDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: AccountActivity | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const [name, setName] = React.useState("");
  const [bank, setBank] = React.useState("Other");
  const [type, setType] = React.useState<AccountType>("checking");
  const [balance, setBalance] = React.useState("0");
  const [includeInNetWorth, setIncludeInNetWorth] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.account.name);
      setBank(existing.account.bank);
      setType(existing.account.type);
      setBalance(String(existing.balance));
      setIncludeInNetWorth(existing.account.include_in_net_worth);
    } else {
      setName("");
      setBank("Other");
      setType("checking");
      setBalance("0");
      setIncludeInNetWorth(true);
    }
  }, [open, existing]);

  function submit() {
    const input: AccountInput = {
      name,
      bank,
      type,
      balance,
      include_in_net_worth: includeInNetWorth,
    };
    start(async () => {
      const res = existing
        ? await updateAccount(existing.account.id, input)
        : await createAccount(input);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to save.");
        return;
      }
      toast.success(existing ? "Account updated." : "Account added.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit account" : "Add account"}</DialogTitle>
          <DialogDescription>
            {existing
              ? "Set the exact current balance. Activity is layered on top going forward."
              : "Track a bank, card, or cash balance."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="acct-name">Name</Label>
            <Input id="acct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chase Checking" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acct-bank">Bank</Label>
              <Input id="acct-bank" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. Chase" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acct-balance">Current balance</Label>
            <Input
              id="acct-balance"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground">
              {type === "credit_card"
                ? "Enter what you owe as a negative number (0 if paid off)."
                : "The exact amount currently in this account."}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="acct-networth" className="text-sm">Include in net worth</Label>
              <p className="text-xs text-muted-foreground">Count this account toward totals.</p>
            </div>
            <Switch id="acct-networth" checked={includeInNetWorth} onCheckedChange={setIncludeInNetWorth} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : existing ? "Save changes" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
