"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  Ban,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  HandCoins,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/money";
import { Reveal } from "@/components/reveal";
import { ReconciliationFlow } from "@/components/reconciliation";
import { fmtDate, fmtMoney, hueColor, monthLabel, monthKey, todayISO } from "@/lib/format";
import { myAmount, isSavingsTxn, reconcile, signed, monthlyBalances } from "@/lib/calc";
import { cn } from "@/lib/utils";
import type { TransactionRow, TransactionDebtorRow, CreditorRow } from "@/lib/database.types";
import { useReadOnly } from "@/components/read-only-context";
import { TransactionDialog, type TxnLookups } from "./transaction-dialog";
import { ReimburseDialog } from "./reimburse-dialog";
import { SettleSplitDialog } from "./settle-split-dialog";
import { deleteTransaction, setTransactionTransfer, settleReimbursement } from "./actions";

const VIEW_ONLY = "View only - sign in to make changes.";

const CURRENT_MONTH = todayISO().slice(0, 7);

export function TransactionsView({
  transactions,
  debtorLinks,
  creditors,
  lookups,
  netWorth,
  netWorthAll,
  hiddenAccountIds,
}: {
  transactions: TransactionRow[];
  debtorLinks: TransactionDebtorRow[];
  creditors: CreditorRow[];
  lookups: TxnLookups;
  netWorth: number; // net worth with hidden accounts excluded
  netWorthAll: number; // net worth including hidden accounts (for the reveal toggle)
  hiddenAccountIds: string[];
}) {
  const router = useRouter();
  const catById = React.useMemo(
    () => new Map(lookups.categories.map((c) => [c.id, c])),
    [lookups.categories],
  );
  const acctById = React.useMemo(
    () => new Map(lookups.accounts.map((a) => [a.id, a])),
    [lookups.accounts],
  );
  const debtorNameById = React.useMemo(
    () => new Map(lookups.debtors.map((d) => [d.id, d.name])),
    [lookups.debtors],
  );
  // Who owes you on each split expense (the transaction_debtors rows), grouped by
  // transaction, so a row can show its participants and route settling to People.
  const peopleByTxn = React.useMemo(() => {
    const map = new Map<string, { debtor_id: string; share: number }[]>();
    for (const l of debtorLinks) {
      const arr = map.get(l.transaction_id);
      if (arr) arr.push({ debtor_id: l.debtor_id, share: l.share });
      else map.set(l.transaction_id, [{ debtor_id: l.debtor_id, share: l.share }]);
    }
    return map;
  }, [debtorLinks]);
  const creditorNameById = React.useMemo(
    () => new Map(creditors.map((c) => [c.id, c.name])),
    [creditors],
  );
  // A creditor "paid for me" is stored as a net-zero pair on an account: your
  // real expense (outflow, creditor_id, repays_id -> the borrow) plus an excluded
  // borrow inflow that offsets it (so your balance doesn't move - a friend paid).
  // We collapse each pair into the single expense line and hide the phantom
  // inflow, since no money actually touched your account.
  const paidForMeBorrowIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      if (!t.is_transfer && t.creditor_id && t.repays_id) set.add(t.repays_id);
    }
    return set;
  }, [transactions]);
  const isPaidForMe = (t: TransactionRow) => !t.is_transfer && !!t.creditor_id && !!t.repays_id;

  const [search, setSearch] = React.useState("");
  const [account, setAccount] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [direction, setDirection] = React.useState("all");
  // Hidden accounts vanish from this page too by default; a toggle brings their
  // rows (and their contribution to the numbers) back when you want to review.
  const [showHidden, setShowHidden] = React.useState(false);
  const hiddenSet = React.useMemo(() => new Set(hiddenAccountIds), [hiddenAccountIds]);
  const hasHidden = hiddenAccountIds.length > 0;
  const activeTxns = React.useMemo(
    () => (showHidden ? transactions : transactions.filter((t) => !hiddenSet.has(t.account_id))),
    [transactions, showHidden, hiddenSet],
  );
  const nw = showHidden ? netWorthAll : netWorth;
  // Don't let a hidden account stay selected in the filter once its rows are gone.
  React.useEffect(() => {
    if (!showHidden && account !== "all" && hiddenSet.has(account)) setAccount("all");
  }, [showHidden, account, hiddenSet]);
  const accountOptions = showHidden ? lookups.accounts : lookups.accounts.filter((a) => !hiddenSet.has(a.id));

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TransactionRow | null>(null);
  const [reimburseOpen, setReimburseOpen] = React.useState(false);
  const [reimbursing, setReimbursing] = React.useState<TransactionRow | null>(null);
  const [settleSplitOpen, setSettleSplitOpen] = React.useState(false);
  const [settlingSplit, setSettlingSplit] = React.useState<TransactionRow | null>(null);
  // Current month starts expanded; other months collapsed.
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set([CURRENT_MONTH]));

  const filterActive =
    search.trim() !== "" || account !== "all" || category !== "all" || direction !== "all";

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeTxns
      .filter((t) => {
        // Hide the offsetting borrow half of a "paid for me" pair from the list;
        // its expense line stands in for the whole thing. It stays in activeTxns
        // so the running balance math still sees the net-zero pair.
        if (paidForMeBorrowIds.has(t.id)) return false;
        if (q) {
          // Match the description OR the amount, so you can find a transaction by
          // its number when you don't remember what you called it. A numeric query
          // (ignoring $ , and spaces) is substring-matched against the raw amount
          // and its 2-decimal form: "22", "22.04" and "1000" all hit 22.04 / 1000.
          const qNum = q.replace(/[$,\s]/g, "");
          const amountHit =
            /^[0-9]+\.?[0-9]*$/.test(qNum) &&
            (String(t.amount).includes(qNum) || t.amount.toFixed(2).includes(qNum));
          if (!t.description.toLowerCase().includes(q) && !amountHit) return false;
        }
        if (account !== "all" && t.account_id !== account) return false;
        if (category !== "all" && t.category_id !== category) return false;
        if (direction !== "all") {
          if (direction === "transfer") {
            if (!t.is_transfer) return false;
          } else if (t.is_transfer || t.direction !== direction) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) =>
        a.txn_date < b.txn_date ? 1 : a.txn_date > b.txn_date ? -1 : b.created_at.localeCompare(a.created_at),
      );
  }, [activeTxns, search, account, category, direction, paidForMeBorrowIds]);

  // Group filtered transactions by month (newest month first).
  const groups = React.useMemo(() => {
    const map = new Map<string, TransactionRow[]>();
    for (const t of filtered) {
      const key = monthKey(t.txn_date);
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, txns]) => {
        // Transfers and savings aren't income/spending.
        const real = txns.filter((t) => !t.is_transfer);
        const inflow = real.filter((t) => t.direction === "inflow").reduce((s, t) => s + t.amount, 0);
        // Only your share counts (split expenses), savings excluded.
        const outflow = real.filter((t) => !isSavingsTxn(t)).reduce((s, t) => s + myAmount(t), 0);
        return { key, label: monthLabel(key), txns, inflow, outflow, net: inflow - outflow };
      });
  }, [filtered]);

  const real = filtered.filter((t) => !t.is_transfer);
  const totalIn = real.filter((t) => t.direction === "inflow").reduce((s, t) => s + t.amount, 0);
  const totalOut = real.filter((t) => !isSavingsTxn(t)).reduce((s, t) => s + myAmount(t), 0);
  // Full-ledger reconciliation (independent of the active filter). Uses the
  // visible ledger by default; the reveal toggle folds hidden accounts back in.
  const recon = reconcile(activeTxns, nw);

  // Opening/closing available-funds balance per month, from the WHOLE ledger
  // (not the filtered view) so the chain stays correct regardless of filters.
  const balances = React.useMemo(() => {
    const nwIds = new Set(
      lookups.accounts
        .filter((a) => a.include_in_net_worth && (showHidden || !hiddenSet.has(a.id)))
        .map((a) => a.id),
    );
    return monthlyBalances(activeTxns, nwIds, nw);
  }, [activeTxns, lookups.accounts, nw, showHidden, hiddenSet]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  // When filters are active, expand every matching month so results are visible.
  const isOpen = (key: string) => filterActive || expanded.has(key);

  const readOnly = useReadOnly();

  function onAdd() {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setEditing(null);
    setDialogOpen(true);
  }
  function onEdit(t: TransactionRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setEditing(t);
    setDialogOpen(true);
  }
  function onReimburse(t: TransactionRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setReimbursing(t);
    setReimburseOpen(true);
  }
  function onSettleSplit(t: TransactionRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setSettlingSplit(t);
    setSettleSplitOpen(true);
  }
  function onSettle(t: TransactionRow, outstanding: number) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    if (
      !window.confirm(
        `Write off ${fmtMoney(outstanding, { cents: true })} of "${t.description}" as your own spending? It will stop showing as owed to you.`,
      )
    )
      return;
    settleReimbursement(t.id).then((res) => {
      if (!res.ok) toast.error(res.error ?? "Failed to write off.");
      else {
        toast.success("Written off as spent. No longer owed to you.");
        router.refresh();
      }
    });
  }
  function onDelete(t: TransactionRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    if (!window.confirm(`Delete "${t.description}"?`)) return;
    deleteTransaction(t.id).then((res) => {
      if (!res.ok) toast.error(res.error ?? "Failed to delete.");
      else {
        toast.success("Transaction deleted.");
        router.refresh();
      }
    });
  }
  function onToggleTransfer(t: TransactionRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setTransactionTransfer(t.id, !t.is_transfer).then((res) => {
      if (!res.ok) toast.error(res.error ?? "Failed to update.");
      else {
        toast.success(t.is_transfer ? "Included in totals." : "Excluded from totals.");
        router.refresh();
      }
    });
  }

  function Avatar({ t }: { t: TransactionRow }) {
    const base = "flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold [&_svg]:size-4";
    if (t.is_transfer) {
      return <span className={cn(base, "bg-muted text-muted-foreground")}><ArrowLeftRight /></span>;
    }
    if (isSavingsTxn(t)) {
      return (
        <span className={base} style={{ background: "color-mix(in oklab, var(--chart-2) 16%, transparent)", color: "var(--chart-2)" }}>
          <PiggyBank />
        </span>
      );
    }
    if (t.direction === "inflow") {
      return (
        <span className={base} style={{ background: "color-mix(in oklab, var(--positive) 16%, transparent)", color: "var(--positive)" }}>
          <ArrowDownLeft />
        </span>
      );
    }
    const cat = t.category_id ? catById.get(t.category_id) : undefined;
    const color = cat ? hueColor(cat.color_hue) : "var(--muted-foreground)";
    return (
      <span className={base} style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
        {cat ? cat.name.charAt(0).toUpperCase() : <Receipt />}
      </span>
    );
  }

  function renderRow(t: TransactionRow) {
    const cat = t.category_id ? catById.get(t.category_id) : undefined;
    const acct = acctById.get(t.account_id);
    const color = cat ? hueColor(cat.color_hue) : "var(--muted-foreground)";
    // People who owe you a slice of this expense (a multi-person split). These
    // settle on the People page, per person - not with the per-txn actions below.
    const people = peopleByTxn.get(t.id);
    const isPeopleSplit = !!people?.length;
    // A creditor paid for this directly - your spending, but you owe them, and no
    // money left your account. Show who paid instead of the account.
    const paidBy = isPaidForMe(t) ? creditorNameById.get(t.creditor_id!) ?? "someone" : null;
    const isSplit =
      !t.is_transfer &&
      (t.whose_expense === "Group" || t.whose_expense === "Roommates") &&
      (!!t.split_count || isPeopleSplit);
    // Reimbursable money still outstanding on this expense (for the write-off action).
    const owedBack = !t.is_transfer && t.reimbursable ? t.amount - myAmount(t) : 0;
    const outstanding = Math.max(0, owedBack - (t.reimbursed_amount ?? 0));
    return (
      <div
        key={t.id}
        role="button"
        tabIndex={0}
        onClick={() => onEdit(t)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onEdit(t);
          }
        }}
        className="group/row flex cursor-pointer items-center gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 sm:px-4"
      >
        <Avatar t={t} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{t.description}</span>
            {t.is_transfer ? (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <EyeOff className="size-2.5" /> Excluded
              </Badge>
            ) : isSavingsTxn(t) ? (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <PiggyBank className="size-2.5" /> Savings
              </Badge>
            ) : t.whose_expense && t.whose_expense !== "My" ? (
              <Badge variant="outline" className="text-[10px]">{t.whose_expense}</Badge>
            ) : null}
            {!t.is_transfer && t.reimbursable ? (
              t.reimbursed ? (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Check className="size-2.5" /> Reimbursed
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <HandCoins className="size-2.5" /> Reimbursable
                </Badge>
              )
            ) : null}
            {paidBy ? (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <HandCoins className="size-2.5" /> You owe
              </Badge>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="tnum">{fmtDate(t.txn_date, "short")}</span>
            {paidBy ? (
              <>
                <span className="opacity-40">·</span>
                <span className="truncate">Paid by {paidBy}</span>
              </>
            ) : acct ? (
              <>
                <span className="opacity-40">·</span>
                <span className="truncate">{acct.name}</span>
              </>
            ) : null}
            {cat ? (
              <>
                <span className="opacity-40">·</span>
                <span className="inline-flex shrink-0 items-center gap-1">
                  <span className="size-1.5 rounded-full" style={{ background: color }} />
                  {cat.name}
                </span>
              </>
            ) : null}
            {isPeopleSplit ? (
              <>
                <span className="opacity-40">·</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3 shrink-0" />
                  <span className="truncate">
                    {people!.map((p) => debtorNameById.get(p.debtor_id) ?? "someone").join(", ")}
                  </span>
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {t.is_transfer ? (
            <Money value={t.amount} cents className="text-sm font-semibold text-muted-foreground" />
          ) : (
            <Money value={signed(t)} cents colored className="text-sm font-semibold" />
          )}
          {isSplit ? (
            <div className="text-[10px] text-muted-foreground tnum">
              your {fmtMoney(myAmount(t), { cents: true })} of {fmtMoney(t.amount)}
            </div>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => e.stopPropagation()}
              className="size-7 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover/row:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onEdit(t)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            {/* A multi-person split settles per person on the People page, so the
                whole-expense reimburse / write-off actions are hidden here. */}
            {!t.is_transfer && t.reimbursable && !t.reimbursed && !isPeopleSplit ? (
              <DropdownMenuItem onClick={() => onReimburse(t)}>
                <HandCoins className="size-4" /> Record reimbursement
              </DropdownMenuItem>
            ) : null}
            {!t.is_transfer && t.reimbursable && !t.reimbursed && !isPeopleSplit && outstanding > 0.005 ? (
              <DropdownMenuItem onClick={() => onSettle(t, outstanding)}>
                <Ban className="size-4" /> Write off {fmtMoney(outstanding, { cents: true })} as spent
              </DropdownMenuItem>
            ) : null}
            {!t.is_transfer && t.direction === "outflow" && !t.reimbursable && myAmount(t) > 0.005 ? (
              <DropdownMenuItem onClick={() => onSettleSplit(t)}>
                <Users className="size-4" /> Settle a split
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => onToggleTransfer(t)}>
              {t.is_transfer ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              {t.is_transfer ? "Include in totals" : "Exclude from totals"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(t)}>
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card/60 p-2 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-50">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description or amount…"
            className="border-transparent bg-background/60 pl-8"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:contents">
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="w-full border-transparent bg-background/60 sm:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="outflow">Expenses</SelectItem>
              <SelectItem value="inflow">Income</SelectItem>
              <SelectItem value="transfer">Excluded</SelectItem>
            </SelectContent>
          </Select>
          <Select value={account} onValueChange={setAccount}>
            <SelectTrigger className="w-full border-transparent bg-background/60 sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accountOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full border-transparent bg-background/60 sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {lookups.categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasHidden ? (
          <Button
            variant="outline"
            onClick={() => setShowHidden((v) => !v)}
            className="w-full gap-1.5 border-transparent bg-background/60 sm:w-auto"
            title={showHidden ? "Show only the accounts included in the app" : "Also show accounts you've left out of the app"}
          >
            {showHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showHidden ? "Included only" : "Show all accounts"}
          </Button>
        ) : null}
        <Button onClick={onAdd} className="w-full gap-1.5 sm:w-auto">
          <Plus className="size-4" /> Add
        </Button>
      </div>

      {/* Month groups */}
      {groups.length === 0 ? (
        <Card className="surface">
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Search className="size-5" />
            </span>
            <p className="text-sm font-medium">No transactions match your filters</p>
            <p className="text-xs text-muted-foreground">Try clearing the search or filters above.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g, i) => {
            const open = isOpen(g.key);
            const bal = balances.get(g.key);
            return (
              <Reveal key={g.key} delay={Math.min(i * 40, 240)}>
                <div className="overflow-hidden rounded-2xl border border-border bg-card/80 backdrop-blur-sm surface">
                  <button
                    type="button"
                    onClick={() => toggle(g.key)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        !open && "-rotate-90",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{g.label}</span>
                        {g.key === CURRENT_MONTH ? (
                          <span className="rounded-full grad-brand px-2 py-0.5 text-[10px] font-medium text-white">
                            This month
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {g.txns.length} transaction{g.txns.length === 1 ? "" : "s"}
                      </div>
                      {bal ? (
                        <div className="mt-0.5 text-xs text-muted-foreground tnum">
                          Balance {fmtMoney(bal.opening, { cents: true })}
                          <span className="px-1 opacity-40">→</span>
                          {fmtMoney(bal.closing, { cents: true })}
                        </div>
                      ) : null}
                    </div>
                    <div className="hidden text-right text-xs text-muted-foreground tnum sm:block">
                      <span className="text-positive">{fmtMoney(g.inflow, { cents: true })}</span> in
                      <span className="px-1 opacity-40">·</span>
                      {fmtMoney(g.outflow, { cents: true })} out
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold tnum",
                        g.net >= 0 ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative",
                      )}
                    >
                      {fmtMoney(g.net, { cents: true, sign: true })}
                    </span>
                  </button>
                  {open ? (
                    <div className="divide-y divide-border/50 border-t border-border/70">
                      {g.txns.map(renderRow)}
                    </div>
                  ) : null}
                </div>
              </Reveal>
            );
          })}
        </div>
      )}

      {filterActive ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
          <span>{filtered.length} of {transactions.length} shown</span>
          <span className="flex gap-4">
            <span>In <Money value={totalIn} cents className="font-medium text-positive" /></span>
            <span>Out <Money value={totalOut} cents className="font-medium text-negative" /></span>
          </span>
        </div>
      ) : null}

      {/* The cash identity - proves income/spending/savings reconcile to balance. */}
      <Card className="surface p-4">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold">How your balance adds up</h3>
          <span className="text-xs text-muted-foreground">Whole ledger · {transactions.length} txns</span>
        </div>
        <ReconciliationFlow data={recon} />
      </Card>

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lookups={lookups}
        existing={editing}
        existingPeople={editing ? peopleByTxn.get(editing.id) ?? null : null}
      />
      <ReimburseDialog
        open={reimburseOpen}
        onOpenChange={setReimburseOpen}
        transaction={reimbursing}
        accounts={lookups.accounts}
      />
      <SettleSplitDialog
        open={settleSplitOpen}
        onOpenChange={setSettleSplitOpen}
        transaction={settlingSplit}
        accounts={lookups.accounts}
      />
    </div>
  );
}
