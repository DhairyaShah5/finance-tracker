"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/money";
import { fmtDate, hueColor, monthLabel, monthKey } from "@/lib/format";
import { signed } from "@/lib/calc";
import type { TransactionRow } from "@/lib/database.types";
import { TransactionDialog, type TxnLookups } from "./transaction-dialog";
import { deleteTransaction } from "./actions";

export function TransactionsView({
  transactions,
  lookups,
}: {
  transactions: TransactionRow[];
  lookups: TxnLookups;
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

  const months = React.useMemo(() => {
    const set = new Set(transactions.map((t) => monthKey(t.txn_date)));
    return [...set].sort().reverse();
  }, [transactions]);

  const [search, setSearch] = React.useState("");
  const [month, setMonth] = React.useState("all");
  const [account, setAccount] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [direction, setDirection] = React.useState("all");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TransactionRow | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions
      .filter((t) => {
        if (q && !t.description.toLowerCase().includes(q)) return false;
        if (month !== "all" && monthKey(t.txn_date) !== month) return false;
        if (account !== "all" && t.account_id !== account) return false;
        if (category !== "all") {
          if (category === "none" ? t.category_id !== null : t.category_id !== category) return false;
        }
        if (direction !== "all" && t.direction !== direction) return false;
        return true;
      })
      .sort((a, b) =>
        a.txn_date < b.txn_date ? 1 : a.txn_date > b.txn_date ? -1 : b.created_at.localeCompare(a.created_at),
      );
  }, [transactions, search, month, account, category, direction]);

  const totalIn = filtered.filter((t) => t.direction === "inflow").reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter((t) => t.direction === "outflow").reduce((s, t) => s + t.amount, 0);

  function onAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function onEdit(t: TransactionRow) {
    setEditing(t);
    setDialogOpen(true);
  }
  function onDelete(t: TransactionRow) {
    if (!window.confirm(`Delete "${t.description}"?`)) return;
    deleteTransaction(t.id).then((res) => {
      if (!res.ok) toast.error(res.error ?? "Failed to delete.");
      else {
        toast.success("Transaction deleted.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-50">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description…"
            className="pl-8"
          />
        </div>
        <Select value={direction} onValueChange={setDirection}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="outflow">Expenses</SelectItem>
            <SelectItem value="inflow">Income</SelectItem>
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {lookups.accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="none">Uncategorized</SelectItem>
            {lookups.categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onAdd} className="gap-1.5">
          <Plus className="size-4" /> Add
        </Button>
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="hidden sm:table-cell">Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No transactions match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => {
                const cat = t.category_id ? catById.get(t.category_id) : undefined;
                const acct = acctById.get(t.account_id);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground tnum">
                      {fmtDate(t.txn_date, "short")}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{t.description}</div>
                      {t.whose_expense && t.whose_expense !== "My" ? (
                        <Badge variant="outline" className="mt-0.5 text-[10px]">{t.whose_expense}</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {cat ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span className="size-2 rounded-full" style={{ background: hueColor(cat.color_hue) }} />
                          {cat.name}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {acct?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={signed(t)} cents colored className="font-medium" />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(t)}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => onDelete(t)}>
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{filtered.length} transactions</span>
        <span className="flex gap-4">
          <span>Income <Money value={totalIn} cents className="font-medium text-positive" /></span>
          <span>Spent <Money value={totalOut} cents className="font-medium text-negative" /></span>
        </span>
      </div>

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lookups={lookups}
        existing={editing}
      />
    </div>
  );
}
