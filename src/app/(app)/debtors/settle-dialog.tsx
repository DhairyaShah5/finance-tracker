"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, HandCoins } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtMoney, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccountRow, DebtorRow } from "@/lib/database.types";
import { settleDebtor, type SettleInput } from "./actions";

const today = todayISO;
type Mode = "cash" | "in_kind";

export function SettleDialog({
  open,
  onOpenChange,
  debtor,
  accounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  debtor: DebtorRow | null;
  accounts: AccountRow[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const [mode, setMode] = React.useState<Mode>("cash");
  const [amount, setAmount] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [description, setDescription] = React.useState("");

  const owed = debtor?.amount ?? 0;

  React.useEffect(() => {
    if (!open) return;
    setMode("cash");
    setAmount(owed ? String(owed) : "");
    setAccountId(accounts[0]?.id ?? "");
    setDate(today());
    setDescription("");
  }, [open, owed, accounts]);

  const amt = Math.min(Number(amount) || 0, owed);
  const remaining = Math.max(0, Math.round((owed - amt) * 100) / 100);

  function submit() {
    if (!debtor) return;
    if (amt <= 0) {
      toast.error("Enter an amount to settle.");
      return;
    }
    if (mode === "cash" && !accountId) {
      toast.error("Pick an account.");
      return;
    }
    const input: SettleInput = {
      debtor_id: debtor.id,
      mode,
      amount: String(amt),
      account_id: mode === "cash" ? accountId : null,
      txn_date: mode === "cash" ? date : null,
      description: mode === "cash" ? description.trim() || null : null,
    };
    start(async () => {
      const res = await settleDebtor(input);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to settle.");
        return;
      }
      toast.success(
        remaining > 0
          ? `${debtor.name} settled ${fmtMoney(amt, { cents: true })}. ${fmtMoney(remaining, { cents: true })} left.`
          : `${debtor.name} is all settled up.`,
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settle up{debtor ? ` with ${debtor.name}` : ""}</DialogTitle>
          <DialogDescription>
            {debtor ? `${debtor.name} currently owes you ${fmtMoney(owed, { cents: true })}.` : ""} Record how
            they paid you back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="w-full">
              <TabsTrigger value="cash" className="flex-1 gap-1.5">
                <ArrowDownLeft className="size-3.5" /> Repaid in cash
              </TabsTrigger>
              <TabsTrigger value="in_kind" className="flex-1 gap-1.5">
                <HandCoins className="size-3.5" /> Paid for me
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            {mode === "cash"
              ? "They sent money to your account. It raises your balance but isn't counted as income (it's your fronted money coming back)."
              : "They covered something for you instead of paying you back. No money moves through your bank, so nothing is added to any account - this just clears the debt."}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="settle-amount">Amount</Label>
              <Input
                id="settle-amount"
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
            {mode === "cash" ? (
              <div className="space-y-1.5">
                <Label htmlFor="settle-date">Date</Label>
                <Input id="settle-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            ) : (
              <div className="flex items-end">
                <div className="flex h-9 w-full items-center rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground">
                  No account affected
                </div>
              </div>
            )}
          </div>

          {mode === "cash" ? (
            <>
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
                  placeholder="e.g. Venmo"
                />
              </div>
            </>
          ) : null}

          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <span className="text-muted-foreground">After this</span>
            <span className={cn("font-semibold tnum", remaining > 0 ? "text-foreground" : "text-positive")}>
              {remaining > 0 ? `${fmtMoney(remaining, { cents: true })} still owed` : "All settled up"}
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
