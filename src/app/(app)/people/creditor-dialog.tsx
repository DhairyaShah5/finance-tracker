"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, Gift } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { todayISO } from "@/lib/format";
import type { AccountRow, CategoryRow, CreditorRow } from "@/lib/database.types";
import { createCreditor, updateCreditor, type CreditorInput, type CreditorEditInput } from "./actions";

const NONE = "__none__";
const today = todayISO;
type Mode = "cash" | "in_kind";

export function CreditorDialog({
  open,
  onOpenChange,
  existing,
  accounts,
  categories,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: CreditorRow | null;
  accounts: AccountRow[];
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [mode, setMode] = React.useState<Mode>("cash");
  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [description, setDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState(NONE);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setMode("cash");
    setName(existing?.name ?? "");
    setNote(existing?.note ?? "");
    setAmount("");
    setAccountId(accounts[0]?.id ?? "");
    setDate(today());
    setDescription("");
    setCategoryId(NONE);
  }, [open, existing, accounts]);

  function submit() {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (existing) {
      const input: CreditorEditInput = { name: name.trim(), note: note.trim() || null };
      start(async () => {
        const res = await updateCreditor(existing.id, input);
        if (!res.ok) return void toast.error(res.error ?? "Failed to save.");
        toast.success("Creditor updated.");
        onOpenChange(false);
        router.refresh();
      });
      return;
    }
    if (!(Number(amount) > 0)) {
      toast.error("Enter how much you took.");
      return;
    }
    if (mode === "cash" && !accountId) {
      toast.error("Pick the account the money landed in.");
      return;
    }
    const input: CreditorInput = {
      name: name.trim(),
      mode,
      amount,
      txn_date: date,
      account_id: mode === "cash" ? accountId : null,
      category_id: mode === "in_kind" && categoryId !== NONE ? categoryId : null,
      description: description.trim() || null,
    };
    start(async () => {
      const res = await createCreditor(input);
      if (!res.ok) return void toast.error(res.error ?? "Failed to save.");
      toast.success("Creditor added.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit creditor" : "Add creditor"}</DialogTitle>
          <DialogDescription>
            {existing
              ? "The balance is tracked from what you borrowed from this person, minus what you've paid back."
              : "Records money you took from someone and owe back. The balance is derived from the ledger."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="creditor-name">Name</Label>
            <Input
              id="creditor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aditya"
              autoComplete="off"
            />
          </div>

          {existing ? (
            <div className="space-y-1.5">
              <Label htmlFor="creditor-note">Note</Label>
              <Textarea
                id="creditor-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Optional"
              />
            </div>
          ) : (
            <>
              <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <TabsList className="w-full">
                  <TabsTrigger value="cash" className="flex-1 gap-1.5">
                    <ArrowDownLeft className="size-3.5" /> Sent me cash
                  </TabsTrigger>
                  <TabsTrigger value="in_kind" className="flex-1 gap-1.5">
                    <Gift className="size-3.5" /> Paid for me
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                {mode === "cash"
                  ? "They sent money to your account. It raises your balance but isn't counted as income - it's a loan you owe back."
                  : "They paid for something of yours directly. No money reaches your account, so your balance is untouched, but the purchase counts as your spending and you owe it back."}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="creditor-amount">Amount</Label>
                  <Input
                    id="creditor-amount"
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
                  <Label htmlFor="creditor-date">Date</Label>
                  <Input id="creditor-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>

              {mode === "cash" ? (
                <div className="space-y-1.5">
                  <Label>Into account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="creditor-desc">What for?</Label>
                <Input
                  id="creditor-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    mode === "in_kind"
                      ? `e.g. ${name.trim() || "Aditya"} covered my flight`
                      : `e.g. borrowed from ${name.trim() || "Aditya"}`
                  }
                  autoComplete="off"
                />
              </div>

              {mode === "in_kind" ? (
                <div className="space-y-1.5">
                  <Label>Spending category (optional)</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : existing ? "Save changes" : "Add creditor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
