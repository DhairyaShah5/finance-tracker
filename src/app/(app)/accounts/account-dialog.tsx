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
import type { AccountRow } from "@/lib/database.types";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/defaults";
import { createAccount, updateAccount, type AccountInput } from "./actions";

const TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  credit_card: "Credit card",
  debit_card: "Debit card",
  savings: "Savings",
  cash: "Cash",
};

export function AccountDialog({
  open,
  onOpenChange,
  existing,
  nextOrder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: AccountRow | null;
  /** Default display_order suggested for a new account. */
  nextOrder: number;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const [name, setName] = React.useState("");
  const [bank, setBank] = React.useState("Other");
  const [type, setType] = React.useState<AccountType>("checking");
  const [openingBalance, setOpeningBalance] = React.useState("0");
  const [isCredit, setIsCredit] = React.useState(false);
  const [includeInNetWorth, setIncludeInNetWorth] = React.useState(true);
  const [displayOrder, setDisplayOrder] = React.useState("0");

  // Hydrate form when opening.
  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setBank(existing.bank);
      setType(existing.type);
      setOpeningBalance(String(existing.opening_balance));
      setIsCredit(existing.is_credit);
      setIncludeInNetWorth(existing.include_in_net_worth);
      setDisplayOrder(String(existing.display_order));
    } else {
      setName("");
      setBank("Other");
      setType("checking");
      setOpeningBalance("0");
      setIsCredit(false);
      setIncludeInNetWorth(true);
      setDisplayOrder(String(nextOrder));
    }
  }, [open, existing, nextOrder]);

  // Auto-set is_credit when the type is a credit card.
  function onTypeChange(v: string) {
    const next = v as AccountType;
    setType(next);
    if (next === "credit_card") setIsCredit(true);
  }

  function submit() {
    const input: AccountInput = {
      name,
      bank,
      type,
      opening_balance: openingBalance,
      is_credit: type === "credit_card" ? true : isCredit,
      include_in_net_worth: includeInNetWorth,
      display_order: displayOrder,
    };
    start(async () => {
      const res = existing
        ? await updateAccount(existing.id, input)
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

  const creditLocked = type === "credit_card";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit account" : "Add account"}</DialogTitle>
          <DialogDescription>
            Track a bank, card, or cash balance for your cash flow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="acct-name">Name</Label>
            <Input
              id="acct-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chase Checking"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acct-bank">Bank</Label>
              <Input
                id="acct-bank"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                placeholder="e.g. Chase"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={onTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acct-opening">Opening balance</Label>
              <Input
                id="acct-opening"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acct-order">Display order</Label>
              <Input
                id="acct-order"
                type="number"
                step="1"
                inputMode="numeric"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="acct-credit" className="text-sm">
                Credit account
              </Label>
              <p className="text-xs text-muted-foreground">
                {creditLocked
                  ? "Always on for credit cards."
                  : "Balances can go negative (money owed)."}
              </p>
            </div>
            <Switch
              id="acct-credit"
              checked={isCredit}
              onCheckedChange={setIsCredit}
              disabled={creditLocked}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="acct-networth" className="text-sm">
                Include in net worth
              </Label>
              <p className="text-xs text-muted-foreground">
                Count this account toward totals.
              </p>
            </div>
            <Switch
              id="acct-networth"
              checked={includeInNetWorth}
              onCheckedChange={setIncludeInNetWorth}
            />
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
