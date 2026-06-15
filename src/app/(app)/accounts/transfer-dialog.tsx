"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtMoney } from "@/lib/format";
import type { AccountActivity } from "@/lib/calc";
import { logTransfer, type TransferInput } from "./actions";

const today = () => new Date().toISOString().slice(0, 10);

export interface TransferPreset {
  fromAccountId?: string;
  toAccountId?: string;
  amount?: number;
  note?: string;
}

export function TransferDialog({
  open,
  onOpenChange,
  accounts,
  preset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: AccountActivity[];
  preset?: TransferPreset | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [fromId, setFromId] = React.useState("");
  const [toId, setToId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setFromId(preset?.fromAccountId ?? accounts[0]?.account.id ?? "");
    setToId(preset?.toAccountId ?? "");
    setAmount(preset?.amount != null ? String(preset.amount) : "");
    setDate(today());
    setNote(preset?.note ?? "");
  }, [open, preset, accounts]);

  function submit() {
    const input: TransferInput = {
      from_account_id: fromId,
      to_account_id: toId,
      amount,
      date,
      note: note || null,
    };
    start(async () => {
      const res = await logTransfer(input);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to log transfer.");
        return;
      }
      toast.success("Transfer logged.");
      onOpenChange(false);
      router.refresh();
    });
  }

  const balById = new Map(accounts.map((a) => [a.account.id, a.balance]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer between accounts</DialogTitle>
          <DialogDescription>
            Money leaves one account and lands in the other. Excluded from income & spending.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.account.id} value={a.account.id}>{a.account.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="mb-2 size-4 text-muted-foreground" />
            <div className="space-y-1.5">
              <Label>To</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.account.id} value={a.account.id}>{a.account.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-amount">Amount</Label>
              <Input
                id="t-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-date">Date</Label>
              <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {fromId && toId && fromId !== toId ? (
            <p className="text-xs text-muted-foreground">
              {accounts.find((a) => a.account.id === fromId)?.account.name}{" "}
              {fmtMoney(balById.get(fromId) ?? 0, { cents: true })} →{" "}
              {accounts.find((a) => a.account.id === toId)?.account.name}{" "}
              {fmtMoney(balById.get(toId) ?? 0, { cents: true })}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="t-note">Note</Label>
            <Textarea id="t-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Log transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
