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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AccountRow,
  CategoryRow,
  DebtorRow,
  InflowTypeRow,
  TransactionRow,
} from "@/lib/database.types";
import { WHOSE_EXPENSE_VALUES } from "@/lib/defaults";
import { createTransaction, updateTransaction, type TransactionInput } from "./actions";

const NONE = "__none__";
const today = () => new Date().toISOString().slice(0, 10);

export interface TxnLookups {
  accounts: AccountRow[];
  categories: CategoryRow[];
  inflowTypes: InflowTypeRow[];
  debtors: DebtorRow[];
}

export function TransactionDialog({
  open,
  onOpenChange,
  lookups,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lookups: TxnLookups;
  existing?: TransactionRow | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const [direction, setDirection] = React.useState<"outflow" | "inflow">("outflow");
  const [date, setDate] = React.useState(today());
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [categoryId, setCategoryId] = React.useState(NONE);
  const [inflowTypeId, setInflowTypeId] = React.useState(NONE);
  const [whose, setWhose] = React.useState<string>("My");
  const [debtorId, setDebtorId] = React.useState(NONE);
  const [notes, setNotes] = React.useState("");

  // Hydrate form when opening.
  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setDirection(existing.direction);
      setDate(existing.txn_date);
      setAmount(String(existing.amount));
      setDescription(existing.description);
      setAccountId(existing.account_id);
      setCategoryId(existing.category_id ?? NONE);
      setInflowTypeId(existing.inflow_type_id ?? NONE);
      setWhose(existing.whose_expense ?? "My");
      setDebtorId(existing.debtor_id ?? NONE);
      setNotes(existing.notes ?? "");
    } else {
      setDirection("outflow");
      setDate(today());
      setAmount("");
      setDescription("");
      setAccountId(lookups.accounts[0]?.id ?? "");
      setCategoryId(NONE);
      setInflowTypeId(NONE);
      setWhose("My");
      setDebtorId(NONE);
      setNotes("");
    }
  }, [open, existing, lookups.accounts]);

  function submit() {
    const input: TransactionInput = {
      txn_date: date,
      account_id: accountId,
      category_id: categoryId === NONE ? null : categoryId,
      description,
      direction,
      amount,
      inflow_type_id: inflowTypeId === NONE ? null : inflowTypeId,
      whose_expense: whose as TransactionInput["whose_expense"],
      debtor_id: debtorId === NONE ? null : debtorId,
      notes: notes || null,
    };
    start(async () => {
      const res = existing
        ? await updateTransaction(existing.id, input)
        : await createTransaction(input);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to save.");
        return;
      }
      toast.success(existing ? "Transaction updated." : "Transaction added.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>Record money in or out of an account.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={direction} onValueChange={(v) => setDirection(v as "outflow" | "inflow")}>
            <TabsList className="w-full">
              <TabsTrigger value="outflow" className="flex-1">Expense</TabsTrigger>
              <TabsTrigger value="inflow" className="flex-1">Income</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
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
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Chipotle"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                <SelectContent>
                  {lookups.accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {direction === "outflow" ? (
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Uncategorized</SelectItem>
                    {lookups.categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Income type</Label>
                <Select value={inflowTypeId} onValueChange={setInflowTypeId}>
                  <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unspecified</SelectItem>
                    {lookups.inflowTypes.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {direction === "outflow" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Whose expense</Label>
                <Select value={whose} onValueChange={setWhose}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WHOSE_EXPENSE_VALUES.map((w) => (
                      <SelectItem key={w} value={w}>{w}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {whose !== "My" ? (
                <div className="space-y-1.5">
                  <Label>Debtor</Label>
                  <Select value={debtorId} onValueChange={setDebtorId}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Unassigned</SelectItem>
                      {lookups.debtors.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Debtor (for reimbursements)</Label>
              <Select value={debtorId} onValueChange={setDebtorId}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {lookups.debtors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : existing ? "Save changes" : "Add transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
