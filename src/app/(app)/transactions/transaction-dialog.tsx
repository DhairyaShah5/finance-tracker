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
import { Plus, X } from "lucide-react";
import type {
  AccountRow,
  CategoryRow,
  DebtorRow,
  InflowTypeRow,
  TransactionRow,
} from "@/lib/database.types";
import { WHOSE_EXPENSE_VALUES } from "@/lib/defaults";
import { splitShares } from "@/lib/calc";
import { fmtMoney, hueColor, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createTransaction, updateTransaction, type TransactionInput } from "./actions";

const NONE = "__none__";
const today = todayISO;

/** One person sharing an expense: an existing debtor (`id`) or a new name. */
type PersonPick = { key: string; id: string | null; name: string; share: string };

type Mode = "expense" | "income" | "transfer";

/** A translucent version of a category's color, used to fill its selected chip. */
const hueTint = (hue: number | null | undefined, alpha: number) =>
  `oklch(0.62 0.13 ${hue ?? 250} / ${alpha})`;

/**
 * A tap-to-pick pill. The whole set of choices stays on screen (no dropdown to
 * open and scroll), so the frequent picks are always one tap away.
 */
function Chip({
  selected,
  onClick,
  children,
  style,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
        selected
          ? "border-primary bg-primary/10 font-medium text-foreground"
          : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
      style={style}
    >
      {children}
    </button>
  );
}

/** A row of pills that wraps to as many lines as it needs. */
function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/**
 * One line of a split: a name and the amount that person owes. The field shows
 * the even share as its placeholder; typing a number fixes (overrides) it.
 */
function ShareRow({
  label,
  you,
  value,
  computed,
  onChange,
  onRemove,
}: {
  label: string;
  you?: boolean;
  value: string;
  computed: number;
  onChange: (v: string) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("min-w-0 flex-1 truncate text-sm", you && "font-medium")}>
        {label}
        {you ? " (you)" : ""}
      </span>
      <Input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fmtMoney(computed, { cents: true })}
        className="w-28 text-right tnum"
        aria-label={`${label} share`}
      />
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
        >
          <X className="size-4" />
        </Button>
      ) : (
        <span className="w-7 shrink-0" aria-hidden />
      )}
    </div>
  );
}

export interface TxnLookups {
  accounts: AccountRow[];
  categories: CategoryRow[];
  inflowTypes: InflowTypeRow[];
  debtors: DebtorRow[];
  /** transactions logged per category id - used to order the picker by frequency. */
  categoryCounts: Record<string, number>;
}

export function TransactionDialog({
  open,
  onOpenChange,
  lookups,
  existing,
  existingPeople,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lookups: TxnLookups;
  existing?: TransactionRow | null;
  /** Participants of an existing split, so editing pre-fills the picker. */
  existingPeople?: { debtor_id: string; share: number }[] | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const [mode, setMode] = React.useState<Mode>("expense");
  const [transferDir, setTransferDir] = React.useState<"outflow" | "inflow">("outflow");
  const [date, setDate] = React.useState(today());
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  // Whether the user hand-picked an account. Until they do, the account follows
  // the Expense/Income default (a credit card vs. a checking account).
  const [accountTouched, setAccountTouched] = React.useState(false);
  const [categoryId, setCategoryId] = React.useState(NONE);
  const [budgetGroup, setBudgetGroup] = React.useState(NONE);
  // Whether the user hand-picked Needs/Wants/Savings. Until they do, picking a
  // category keeps the classification in sync with that category's default.
  const [budgetTouched, setBudgetTouched] = React.useState(false);
  const [inflowTypeId, setInflowTypeId] = React.useState(NONE);
  const [whose, setWhose] = React.useState<string>("My");
  const [splitCount, setSplitCount] = React.useState("2");
  const [myShare, setMyShare] = React.useState(""); // explicit "your share" override
  // People sharing this expense (Friend / Group / Roommates). Empty = no one
  // named: Friend needs at least one; Group/Roommates fall back to a plain count.
  const [people, setPeople] = React.useState<PersonPick[]>([]);
  const [newPerson, setNewPerson] = React.useState("");
  const [reimbursable, setReimbursable] = React.useState(false);
  // An income entry that is really returned spend (a refund / money back). It
  // nets against a category instead of counting as income.
  const [isRefund, setIsRefund] = React.useState(false);
  const [notes, setNotes] = React.useState("");

  // The account to pre-select for a mode: a checking account for income, a
  // credit card for an expense; fall back to any account.
  const defaultAccountId = (m: Mode) => {
    const preferred =
      m === "income"
        ? lookups.accounts.find((a) => a.type === "checking")
        : lookups.accounts.find((a) => a.is_credit);
    return preferred?.id ?? lookups.accounts[0]?.id ?? "";
  };

  // Only (re)initialize the form when the dialog opens or switches to a
  // different transaction - never on an incidental prop change. RefreshOnFocus
  // calls router.refresh() when you tab back to the window, handing us a fresh
  // `lookups` array; without this guard that reset would wipe whatever you were
  // typing and snap the mode back to Expense.
  const initedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!open) {
      initedFor.current = null;
      return;
    }
    const key = existing?.id ?? "new";
    if (initedFor.current === key) return;
    initedFor.current = key;
    if (existing) {
      setMode(existing.is_transfer ? "transfer" : existing.direction === "inflow" ? "income" : "expense");
      setTransferDir(existing.direction);
      setDate(existing.txn_date);
      setAmount(String(existing.amount));
      setDescription(existing.description);
      setAccountId(existing.account_id);
      setAccountTouched(true);
      setCategoryId(existing.category_id ?? NONE);
      setBudgetGroup(existing.budget_group ?? NONE);
      setBudgetTouched(existing.budget_group != null);
      setInflowTypeId(existing.inflow_type_id ?? NONE);
      setWhose(existing.whose_expense ?? "My");
      setSplitCount(existing.split_count ? String(existing.split_count) : "2");
      // Pre-fill the split. If it was an even split, leave the amounts blank so it
      // stays even (and re-evens if you change the total); if it was uneven, fill
      // each stored slice as an explicit amount so the exact split is preserved.
      const ep = existingPeople ?? [];
      const isFriendTxn = existing.whose_expense === "Friend";
      const partyCount = ep.length + (isFriendTxn ? 0 : 1);
      const evenEach = partyCount > 0 ? existing.amount / partyCount : 0;
      const wasEven =
        ep.length > 0 &&
        (isFriendTxn || Math.abs((existing.my_share ?? 0) - evenEach) < 0.01) &&
        ep.every((p) => Math.abs(p.share - evenEach) < 0.01);
      setMyShare(ep.length > 0 && wasEven ? "" : existing.my_share != null ? String(existing.my_share) : "");
      setPeople(
        ep.map((p) => ({
          key: p.debtor_id,
          id: p.debtor_id,
          name: lookups.debtors.find((d) => d.id === p.debtor_id)?.name ?? "Someone",
          share: wasEven ? "" : String(p.share),
        })),
      );
      setNewPerson("");
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
      // New entries open on the Expense tab, so default to a credit card.
      setAccountId(defaultAccountId("expense"));
      setAccountTouched(false);
      setCategoryId(NONE);
      setBudgetGroup(NONE);
      setBudgetTouched(false);
      setInflowTypeId(NONE);
      setWhose("My");
      setSplitCount("2");
      setMyShare("");
      setPeople([]);
      setNewPerson("");
      setReimbursable(false);
      setIsRefund(false);
      setNotes("");
    }
  }, [open, existing, existingPeople, lookups.accounts, lookups.debtors]);

  // Tapping a category also fills in its Needs/Wants/Savings group when you
  // haven't set one yet - one less pick for the common case. Never overrides an
  // explicit choice, so you can still classify it however you like.
  function pickCategory(c: CategoryRow) {
    setCategoryId(c.id);
    // Keep the classification following the category until it's set by hand.
    if (!budgetTouched && c.budget_group) setBudgetGroup(c.budget_group);
  }

  // Lead with the accounts you'd actually reach for: credit cards first for an
  // expense, checking accounts first for income. Ties keep their saved display
  // order.
  const accountRank = (a: AccountRow) =>
    mode === "income" ? (a.type === "checking" ? 0 : 1) : a.is_credit ? 0 : 1;
  // RobinHood is funded only indirectly (the weekly cron / the linked Investment
  // category), never by a hand-entered expense or income - so keep it out of the
  // account picker, but still show it when editing a transaction already on it.
  const pickableAccounts = lookups.accounts
    .filter((a) => a.name.trim().toLowerCase() !== "robinhood" || a.id === existing?.account_id)
    .sort((a, b) => accountRank(a) - accountRank(b));

  // Categories, most-used first, so the ones you reach for sit at the top. Ties
  // (and never-used categories) keep their saved display order.
  const sortedCategories = [...lookups.categories].sort(
    (a, b) => (lookups.categoryCounts[b.id] ?? 0) - (lookups.categoryCounts[a.id] ?? 0),
  );

  // Switching Expense/Income moves the default account to match (checking for
  // income, a card for an expense), unless you've already picked one by hand.
  function changeMode(m: Mode) {
    setMode(m);
    if (!accountTouched) setAccountId(defaultAccountId(m));
  }

  // Refunds are handled by the "Refund / money back" toggle, so don't also list
  // "Refund" as an income type - a refund shouldn't appear in two places.
  const incomeTypes = lookups.inflowTypes.filter(
    (i) => i.name.trim().toLowerCase() !== "refund",
  );

  const categoryChips = (opts?: { includeNone?: boolean }) => (
    <ChipRow>
      {opts?.includeNone ? (
        <Chip selected={categoryId === NONE} onClick={() => setCategoryId(NONE)}>
          None
        </Chip>
      ) : null}
      {sortedCategories.map((c) => {
        const on = categoryId === c.id;
        return (
          <Chip
            key={c.id}
            selected={on}
            onClick={() => pickCategory(c)}
            style={on ? { borderColor: hueColor(c.color_hue), backgroundColor: hueTint(c.color_hue, 0.16) } : undefined}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: hueColor(c.color_hue) }}
            />
            {c.name}
          </Chip>
        );
      })}
    </ChipRow>
  );

  // ----- Split across people (Friend / Group / Roommates) -----
  const friendMode = mode === "expense" && whose === "Friend";
  const hasPeople = people.length > 0;
  // Group/Roommates with nobody named falls back to the plain count + toggle.
  const groupNoPeople = (whose === "Group" || whose === "Roommates") && !hasPeople;
  const overrideOf = (s: string) => (s.trim() === "" ? null : Math.max(0, Number(s) || 0));

  function addPerson(p: { id: string | null; name: string }) {
    const name = p.name.trim();
    if (!name) return;
    const key = p.id ?? `new:${name.toLowerCase()}`;
    setPeople((prev) => (prev.some((x) => x.key === key) ? prev : [...prev, { key, id: p.id, name, share: "" }]));
  }
  function removePerson(key: string) {
    setPeople((prev) => prev.filter((p) => p.key !== key));
  }
  function setPersonShare(key: string, share: string) {
    setPeople((prev) => prev.map((p) => (p.key === key ? { ...p, share } : p)));
  }
  function commitNewPerson() {
    const name = newPerson.trim();
    if (!name) return;
    // Typing a name that already exists just adds that debtor, not a duplicate.
    const match = lookups.debtors.find((d) => d.name.trim().toLowerCase() === name.toLowerCase());
    addPerson(match ? { id: match.id, name: match.name } : { id: null, name });
    setNewPerson("");
  }

  // Debtors not already in the split, offered as one-tap chips.
  const availableDebtors = lookups.debtors.filter((d) => !people.some((p) => p.id === d.id));

  // Live share breakdown: even by default, honoring any per-person override, and
  // always reconciling to the amount (mirrors the server's splitShares).
  const amountNum = Number(amount) || 0;
  const partyOverrides = friendMode
    ? people.map((p) => overrideOf(p.share))
    : [overrideOf(myShare), ...people.map((p) => overrideOf(p.share))];
  const shares = hasPeople ? splitShares(amountNum, partyOverrides) : [];
  const myComputed = friendMode ? 0 : shares[0] ?? 0;
  const personComputed = friendMode ? shares : shares.slice(1);

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
    // Every expense you own must be classified - no "Unclassified" escape hatch.
    if (mode === "expense" && !isFriend && budgetGroup === NONE) {
      toast.error("Classify this expense as Needs, Wants, or Savings.");
      return;
    }
    // A refund nets against a category, so it needs one.
    if (refund && categoryId === NONE) {
      toast.error("Pick the category this refund came from.");
      return;
    }
    // A Friend expense is fronted entirely for other people, so it must name at
    // least one. Group / Roommates can name people too, or fall back to a count.
    if (isFriend && !hasPeople) {
      toast.error("Add at least one person you fronted this for.");
      return;
    }
    const splitPeople = mode === "expense" && whose !== "My" && hasPeople;
    const peoplePayload = splitPeople
      ? people.map((p) => ({ id: p.id, name: p.id ? null : p.name, share: overrideOf(p.share) }))
      : undefined;
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
      // With named people the server derives the count; only the plain fallback
      // (Group/Roommates, no one named) still carries a hand-entered split_count.
      split_count:
        mode === "expense" && (whose === "Group" || whose === "Roommates") && !hasPeople
          ? Number(splitCount) || null
          : null,
      my_share:
        mode !== "expense"
          ? null
          : splitPeople
            ? isFriend
              ? null // Friend: your share is 0, the server sets it
              : overrideOf(myShare) // your slice of the split (null = even)
            : myShare.trim() !== ""
              ? Number(myShare)
              : null,
      budget_group:
        mode === "expense" && budgetGroup !== NONE
          ? (budgetGroup as TransactionInput["budget_group"])
          : null,
      people: peoplePayload,
      // Friend = fronted entirely for someone, so it's always a receivable. A
      // named split is a receivable too (the server forces it); the toggle only
      // matters for a plain expense with no one named.
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
        className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl"
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
          <Tabs value={mode} onValueChange={(v) => changeMode(v as Mode)}>
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
                className="text-lg font-semibold tnum"
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

          {/* Account - tap to pick, always visible. */}
          <div className="space-y-1.5">
            <Label>Account</Label>
            <ChipRow>
              {pickableAccounts.map((a) => (
                <Chip
                  key={a.id}
                  selected={accountId === a.id}
                  onClick={() => {
                    setAccountId(a.id);
                    setAccountTouched(true);
                  }}
                >
                  {a.name}
                </Chip>
              ))}
            </ChipRow>
          </div>

          {mode === "transfer" ? (
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
          ) : null}

          {mode === "expense" ? (
            <div className="space-y-1.5">
              <Label>{whose === "Friend" ? "Category (optional)" : "Category"}</Label>
              {categoryChips({ includeNone: whose === "Friend" })}
            </div>
          ) : null}

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

          {mode === "income" && isRefund ? (
            <div className="space-y-1.5">
              <Label>Refund category</Label>
              {categoryChips()}
            </div>
          ) : mode === "income" ? (
            <div className="space-y-1.5">
              <Label>Income type</Label>
              <ChipRow>
                {incomeTypes.map((i) => (
                  <Chip
                    key={i.id}
                    selected={inflowTypeId === i.id}
                    onClick={() => setInflowTypeId(inflowTypeId === i.id ? NONE : i.id)}
                  >
                    {i.name}
                  </Chip>
                ))}
              </ChipRow>
            </div>
          ) : null}

          {mode === "expense" ? (
            <>
              <div className="space-y-1.5">
                <Label>Needs / Wants / Savings</Label>
                <ChipRow>
                  {(
                    [
                      ["Needs", "needs"],
                      ["Wants", "wants"],
                      ["Savings", "savings"],
                    ] as const
                  ).map(([label, value]) => (
                    <Chip
                      key={value}
                      selected={budgetGroup === value}
                      onClick={() => {
                        setBudgetGroup(value);
                        setBudgetTouched(true);
                      }}
                    >
                      {label}
                    </Chip>
                  ))}
                </ChipRow>
                <p className="text-xs text-muted-foreground">
                  You decide per transaction. Savings (investments, vault) is set aside, not spent.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Whose expense</Label>
                <ChipRow>
                  {WHOSE_EXPENSE_VALUES.map((w) => (
                    <Chip
                      key={w}
                      selected={whose === w}
                      onClick={() => {
                        setWhose(w);
                        if (w === "My") {
                          setPeople([]);
                          setNewPerson("");
                        }
                      }}
                    >
                      {w}
                    </Chip>
                  ))}
                </ChipRow>
              </div>

              {/* Split across people: pick existing debtors or add new ones inline,
                  then set each share (even by default, override per person). */}
              {whose !== "My" ? (
                <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
                  <div className="space-y-2">
                    <Label>{whose === "Friend" ? "Who did you pay for?" : "Who are you splitting with?"}</Label>
                    {availableDebtors.length ? (
                      <ChipRow>
                        {availableDebtors.map((d) => (
                          <Chip key={d.id} selected={false} onClick={() => addPerson({ id: d.id, name: d.name })}>
                            <Plus className="size-3 shrink-0" />
                            {d.name}
                          </Chip>
                        ))}
                      </ChipRow>
                    ) : null}
                    <div className="flex gap-2">
                      <Input
                        value={newPerson}
                        onChange={(e) => setNewPerson(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitNewPerson();
                          }
                        }}
                        placeholder="Add someone new…"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={commitNewPerson}
                        disabled={!newPerson.trim()}
                        aria-label="Add person"
                        className="shrink-0"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {hasPeople ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{whose === "Friend" ? "Split across them" : "Split, you included"}</span>
                        <span className="tnum">{fmtMoney(amountNum, { cents: true })} total</span>
                      </div>
                      {whose !== "Friend" ? (
                        <ShareRow label="You" you value={myShare} computed={myComputed} onChange={setMyShare} />
                      ) : null}
                      {people.map((p, i) => (
                        <ShareRow
                          key={p.key}
                          label={p.name}
                          value={p.share}
                          computed={personComputed[i] ?? 0}
                          onChange={(v) => setPersonShare(p.key, v)}
                          onRemove={() => removePerson(p.key)}
                        />
                      ))}
                      <p className="text-xs text-muted-foreground">
                        Even share by default; type a number on any row to fix that person&apos;s amount and
                        the rest re-split evenly.{" "}
                        {whose === "Friend"
                          ? "You owe nothing here; it's all owed back to you."
                          : "Your row is what counts as your spending; the others are owed back to you."}
                      </p>
                    </div>
                  ) : whose === "Friend" ? (
                    <p className="text-xs text-muted-foreground">
                      Add the people you fronted this for. It isn&apos;t your spending - it&apos;s tracked as
                      owed back and shows under each person on People until they pay you.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Add people to track who owes you, or just set the split below.
                    </p>
                  )}
                </div>
              ) : null}

              {/* Plain split by count (Group/Roommates, no one named) or a "My"
                  expense someone will reimburse - both keep the manual toggle. */}
              {groupNoPeople ? (
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
                      {Number(splitCount) > 0 && amountNum > 0
                        ? fmtMoney(amountNum / Number(splitCount), { cents: true })
                        : "-"}
                    </p>
                  </div>
                </div>
              ) : null}

              {whose === "My" || groupNoPeople ? (
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
              ) : null}

              {whose === "My" || groupNoPeople ? (
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
              ) : null}
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
