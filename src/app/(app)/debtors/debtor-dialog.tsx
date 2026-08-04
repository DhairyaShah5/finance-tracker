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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayISO } from "@/lib/format";
import type { AccountRow, CategoryRow, DebtorRow } from "@/lib/database.types";
import { createDebtor, updateDebtor, type DebtorInput, type DebtorEditInput } from "./actions";

const NONE = "__none__";
const today = todayISO;

export function DebtorDialog({
  open,
  onOpenChange,
  existing,
  accounts,
  categories,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: DebtorRow | null;
  accounts: AccountRow[];
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [description, setDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState(NONE);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
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
      const input: DebtorEditInput = { name: name.trim(), note: note.trim() || null };
      start(async () => {
        const res = await updateDebtor(existing.id, input);
        if (!res.ok) return void toast.error(res.error ?? "Failed to save.");
        toast.success("Debtor updated.");
        onOpenChange(false);
        router.refresh();
      });
      return;
    }
    if (!(Number(amount) > 0)) {
      toast.error("Enter how much they owe you.");
      return;
    }
    if (!accountId) {
      toast.error("Pick the account you fronted it from.");
      return;
    }
    const input: DebtorInput = {
      name: name.trim(),
      amount,
      account_id: accountId,
      txn_date: date,
      category_id: categoryId === NONE ? null : categoryId,
      description: description.trim() || null,
    };
    start(async () => {
      const res = await createDebtor(input);
      if (!res.ok) return void toast.error(res.error ?? "Failed to save.");
      toast.success("Debtor added.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit debtor" : "Add debtor"}</DialogTitle>
          <DialogDescription>
            {existing
              ? "The balance is tracked from the expenses you fronted for this person."
              : "Records money you fronted for someone. It logs an expense from your account and tracks it as owed back."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="debtor-name">Name</Label>
            <Input
              id="debtor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vivek"
              autoComplete="off"
            />
          </div>

          {existing ? (
            <div className="space-y-1.5">
              <Label htmlFor="debtor-note">Note</Label>
              <Textarea
                id="debtor-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Optional"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="debtor-amount">Amount owed</Label>
                  <Input
                    id="debtor-amount"
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
                  <Label htmlFor="debtor-date">Date</Label>
                  <Input id="debtor-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Fronted from</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="debtor-desc">What for?</Label>
                <Input
                  id="debtor-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={`e.g. ${name.trim() || "Vivek"} — Chase overdrawn`}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Category (optional)</Label>
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
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : existing ? "Save changes" : "Add debtor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
