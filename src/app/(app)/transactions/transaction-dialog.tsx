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
import { Switch } from "@/components/ui/switch";
import type {
  AccountRow,
  CategoryRow,
  DebtorRow,
  InflowTypeRow,
  TransactionRow,
} from "@/lib/database.types";
import { WHOSE_EXPENSE_VALUES } from "@/lib/defaults";
import { fmtMoney, todayISO } from "@/lib/format";
import { createTransaction, updateTransaction, type TransactionInput } from "./actions";

const NONE = "__none__";
const NEW_DEBTOR = "__new_debtor__";
const today = todayISO;

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
  const [debtorName, setDebtorName] = React.useState(""); // for a new person typed inline
  const [reimbursable, setReimbursable] = React.useState(false);
  // An income entry that is really returned spend (a refund / money back). It
  // nets against a category instead of counting as income.
  const [isRefund, setIsRefund] = React.useState(false);
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
      setDebtorName("");
      setReimbursable(existing.reimbursable ?? false);
      // A non-transfer inflow carrying a category is a refund / return.
      setIsRefund(existing.direction === "inflow" && !existing.is_transfer && existing.category_id != null);
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
      setDebtorName("");
      setReimbursable(false);
      setIsRefund(false);
      setNotes("");
    }
  }, [open, existing, lookups.accounts]);

  function submit() {
    const direction = mode === "transfer" ? transferDir : mode === "income" ? "inflow" : "outflow";
    const refund = mode === "income" && isRefund;
    const isFriend = mode === "expense" && whose === "Friend";
    // Every expense must be categorized - EXCEPT a Friend expense, which isn't
    // your spending at all, so a category is optional there.
    if (mode === "expense" && !isFriend && categoryId === NONE) {
      toast.error("Pick a category for this expense.");
      return;
    }
    // A refund nets against a category, so it needs one.
    if (refund && categoryId === NONE) {
      toast.error("Pick the category this refund came from.");
      return;
    }
    // A Friend expense must land under a person on Debtors.
    const pickedDebtor = debtorId !== NONE && debtorId !== NEW_DEBTOR;
    const newDebtor = debtorId === NEW_DEBTOR && debtorName.trim() !== "";
    if (isFriend && !pickedDebtor && !newDebtor) {
      toast.error("Pick who owes you, or add a new person.");
      return;
    }
    const input: TransactionInput = {
      txn_date: date,
      account_id: accountId,
      // Expenses and refunds carry a category; plain income does not.
      category_id: (mode === "expense" || refund) && categoryId !== NONE ? categoryId : null,
      description,
      direction,
      amount,
      inflow_type_id: mode === "income" && !refund && inflowTypeId !== NONE ? inflowTypeId : null,
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
      debtor_id: pickedDebtor ? debtorId : null,
      debtor_name: newDebtor ? debtorName.trim() : null,
      // Friend = fronted entirely for someone, so it's always a receivable.
      reimbursable: mode === "expense" ? isFriend || reimbursable : false,
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
      <DialogContent
        className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-md"
        style={{ maxHeight: "90dvh" }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{existing ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>
            {mode === "transfer"
              ? "Move money between your own accounts. Excluded from income & spending."
              : "Record money in or out of an account."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto -mr-2 pr-2">
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
                <Label>{whose === "Friend" ? "Category (optional)" : "Category"}</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder={whose === "Friend" ? "None" : "Pick a category"} />
                  </SelectTrigger>
                  <SelectContent>
                    {whose === "Friend" ? <SelectItem value={NONE}>None</SelectItem> : null}
                    {lookups.categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : mode === "income" && isRefund ? (
              <div className="space-y-1.5">
                <Label>Refund category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Category it came from" /></SelectTrigger>
                  <SelectContent>
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

          {mode === "income" ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <div className="space-y-0.5">
                <Label htmlFor="is-refund" className="text-sm">Refund / money back</Label>
                <p className="text-xs text-muted-foreground">
                  Money coming back on a purchase. It nets against the category instead of counting as income.
                </p>
              </div>
              <Switch id="is-refund" checked={isRefund} onCheckedChange={setIsRefund} />
            </div>
          ) : null}

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
                  <Select
                    value={whose}
                    onValueChange={(v) => {
                      setWhose(v);
                      if (v === "My") setDebtorId(NONE);
                      else if (v !== "Friend" && debtorId === NEW_DEBTOR) setDebtorId(NONE);
                    }}
                  >
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
                    <Label>{whose === "Friend" ? "Who owes you?" : "Debtor"}</Label>
                    <Select value={debtorId} onValueChange={setDebtorId}>
                      <SelectTrigger>
                        <SelectValue placeholder={whose === "Friend" ? "Pick or add" : "Optional"} />
                      </SelectTrigger>
                      <SelectContent>
                        {whose !== "Friend" ? <SelectItem value={NONE}>Unassigned</SelectItem> : null}
                        {lookups.debtors.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                        {whose === "Friend" ? (
                          <SelectItem value={NEW_DEBTOR}>+ New person…</SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              {whose === "Friend" && debtorId === NEW_DEBTOR ? (
                <div className="space-y-1.5">
                  <Label htmlFor="debtor-name">New person&apos;s name</Label>
                  <Input
                    id="debtor-name"
                    value={debtorName}
                    onChange={(e) => setDebtorName(e.target.value)}
                    placeholder="e.g. Vivek"
                    autoComplete="off"
                  />
                </div>
              ) : null}

              {whose === "Friend" ? (
                <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
                  Fronted entirely for someone else, so it isn&apos;t your spending — no category
                  needed. It&apos;s tracked as owed back and shows under this person on Debtors until
                  they pay you back.
                </p>
              ) : (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="reimbursable">Reimbursable</Label>
                    <p className="text-xs text-muted-foreground">
                      Someone will pay you back for this (e.g. a work expense). It is kept out of your
                      budget and tracked as owed back until the money lands.
                    </p>
                    {existing?.reimbursed ? (
                      <p className="text-xs font-medium text-positive">Already reimbursed.</p>
                    ) : (existing?.reimbursed_amount ?? 0) > 0 ? (
                      <p className="text-xs font-medium text-primary">
                        Partly reimbursed: {fmtMoney(existing!.reimbursed_amount, { cents: true })} back so far.
                      </p>
                    ) : null}
                  </div>
                  <Switch
                    id="reimbursable"
                    checked={reimbursable}
                    onCheckedChange={setReimbursable}
                    disabled={(existing?.reimbursed_amount ?? 0) > 0}
                  />
                </div>
              )}

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
                  (or less) than your share. It changes your spending, not the amount paid.
                </p>
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter className="shrink-0">
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
