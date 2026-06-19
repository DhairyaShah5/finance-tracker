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
import { fmtMoney } from "@/lib/format";
import { createTransaction, updateTransaction, type TransactionInput } from "./actions";

const NONE = "__none__";
const today = () => new Date().toISOString().slice(0, 10);

type Mode = "expense" | "income" | "transfer";

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

  const [mode, setMode] = React.useState<Mode>("expense");
  const [transferDir, setTransferDir] = React.useState<"outflow" | "inflow">("outflow");
  const [date, setDate] = React.useState(today());
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [categoryId, setCategoryId] = React.useState(NONE);
  const [budgetGroup, setBudgetGroup] = React.useState(NONE);
  const [inflowTypeId, setInflowTypeId] = React.useState(NONE);
  const [whose, setWhose] = React.useState<string>("My");
  const [splitCount, setSplitCount] = React.useState("2");
  const [myShare, setMyShare] = React.useState(""); // explicit "your share" override
  const [debtorId, setDebtorId] = React.useState(NONE);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setMode(existing.is_transfer ? "transfer" : existing.direction === "inflow" ? "income" : "expense");
      setTransferDir(existing.direction);
      setDate(existing.txn_date);
      setAmount(String(existing.amount));
      setDescription(existing.description);
      setAccountId(existing.account_id);
      setCategoryId(existing.category_id ?? NONE);
      setBudgetGroup(existing.budget_group ?? NONE);
      setInflowTypeId(existing.inflow_type_id ?? NONE);
      setWhose(existing.whose_expense ?? "My");
      setSplitCount(existing.split_count ? String(existing.split_count) : "2");
      setMyShare(existing.my_share != null ? String(existing.my_share) : "");
      setDebtorId(existing.debtor_id ?? NONE);
      setNotes(existing.notes ?? "");
    } else {
      setMode("expense");
      setTransferDir("outflow");
      setDate(today());
      setAmount("");
      setDescription("");
      setAccountId(lookups.accounts[0]?.id ?? "");
      setCategoryId(NONE);
      setBudgetGroup(NONE);
      setInflowTypeId(NONE);
      setWhose("My");
      setSplitCount("2");
      setMyShare("");
      setDebtorId(NONE);
      setNotes("");
    }
  }, [open, existing, lookups.accounts]);

  function submit() {
    const direction = mode === "transfer" ? transferDir : mode === "income" ? "inflow" : "outflow";
    const input: TransactionInput = {
      txn_date: date,
      account_id: accountId,
      category_id: categoryId === NONE ? null : categoryId,
      description,
      direction,
      amount,
      inflow_type_id: inflowTypeId === NONE ? null : inflowTypeId,
      whose_expense: whose as TransactionInput["whose_expense"],
      split_count:
        mode === "expense" && (whose === "Group" || whose === "Roommates")
          ? Number(splitCount) || null
          : null,
      my_share: mode === "expense" && myShare.trim() !== "" ? Number(myShare) : null,
      budget_group:
        mode === "expense" && budgetGroup !== NONE
          ? (budgetGroup as TransactionInput["budget_group"])
          : null,
      debtor_id: debtorId === NONE ? null : debtorId,
      notes: notes || null,
      is_transfer: mode === "transfer",
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
          <DialogDescription>
            {mode === "transfer"
              ? "Move money between your own accounts. Excluded from income & spending."
              : "Record money in or out of an account."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="w-full">
              <TabsTrigger value="expense" className="flex-1">Expense</TabsTrigger>
              <TabsTrigger value="income" className="flex-1">Income</TabsTrigger>
              {/* Transfers are created on the Accounts page; only shown here when editing one. */}
              {existing?.is_transfer ? (
                <TabsTrigger value="transfer" className="flex-1">Transfer</TabsTrigger>
              ) : null}
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
              placeholder={mode === "transfer" ? "e.g. Chase → BofA" : "e.g. Chipotle"}
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

            {mode === "expense" ? (
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
            ) : mode === "income" ? (
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
            ) : (
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select value={transferDir} onValueChange={(v) => setTransferDir(v as "outflow" | "inflow")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outflow">Out of this account</SelectItem>
                    <SelectItem value="inflow">Into this account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {mode === "expense" ? (
            <>
              <div className="space-y-1.5">
                <Label>Needs / Wants / Savings</Label>
                <Select value={budgetGroup} onValueChange={setBudgetGroup}>
                  <SelectTrigger><SelectValue placeholder="Unclassified" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unclassified</SelectItem>
                    <SelectItem value="needs">Needs</SelectItem>
                    <SelectItem value="wants">Wants</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  You decide per transaction. Savings (investments, vault) is set aside, not spent.
                </p>
              </div>

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

              {whose === "Group" || whose === "Roommates" ? (
                <div className="grid grid-cols-2 items-end gap-3 rounded-lg border border-border bg-secondary/40 p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="split">Split between (incl. you)</Label>
                    <Input
                      id="split"
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={splitCount}
                      onChange={(e) => setSplitCount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Your share</p>
                    <p className="text-lg font-semibold tnum">
                      {Number(splitCount) > 0 && Number(amount) > 0
                        ? fmtMoney(Number(amount) / Number(splitCount), { cents: true })
                        : "-"}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="my_share">Your share (optional)</Label>
                <Input
                  id="my_share"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Override how much counts as your spending"
                  value={myShare}
                  onChange={(e) => setMyShare(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the even split above. Set this when you actually covered more
                  (or less) than your share — it changes your spending, not the amount paid.
                </p>
              </div>
            </>
          ) : null}

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
            {pending ? "Saving…" : existing ? "Save changes" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
