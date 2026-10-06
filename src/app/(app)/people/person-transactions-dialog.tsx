"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Money } from "@/components/money";
import { signed } from "@/lib/calc";
import { fmtDate, fmtMoney, hueColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/components/read-only-context";
import type { CategoryRow, TransactionRow } from "@/lib/database.types";
import { TransactionDialog, type TxnLookups } from "../transactions/transaction-dialog";
import { deleteTransaction } from "../transactions/actions";

export type PersonInfo = { name: string; net: number; debtorId: string | null };

/** What this transaction means for the person whose list we're looking at. */
function tagFor(t: TransactionRow): { label: string; tone: "owed" | "owe" | "neutral" } {
  if (t.is_transfer && t.direction === "inflow" && t.reimburses_id) return { label: "They repaid you", tone: "neutral" };
  if (t.is_transfer && t.direction === "outflow" && t.repays_id) return { label: "You repaid", tone: "neutral" };
  if (t.is_transfer && t.direction === "inflow" && t.creditor_id) return { label: "You borrowed", tone: "owe" };
  if (!t.is_transfer && t.creditor_id && t.repays_id) return { label: "They paid for you", tone: "owe" };
  if (!t.is_transfer && t.direction === "outflow") return { label: "Owed to you", tone: "owed" };
  return { label: "", tone: "neutral" };
}

export function PersonTransactionsDialog({
  open,
  onOpenChange,
  person,
  transactions,
  lookups,
  linksByTxn,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  person: PersonInfo | null;
  transactions: TransactionRow[];
  lookups: TxnLookups;
  linksByTxn: Map<string, { debtor_id: string; share: number }[]>;
}) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const catById = React.useMemo(
    () => new Map(lookups.categories.map((c: CategoryRow) => [c.id, c])),
    [lookups.categories],
  );

  const [txnDialogOpen, setTxnDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TransactionRow | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // Hide the offsetting borrow half of a "paid for me" pair - the expense line
  // represents it (same as the Transactions page).
  const rows = React.useMemo(() => {
    const borrowIds = new Set<string>();
    for (const t of transactions) if (!t.is_transfer && t.creditor_id && t.repays_id) borrowIds.add(t.repays_id);
    return transactions.filter((t) => !borrowIds.has(t.id));
  }, [transactions]);

  function guard(fn: () => void) {
    if (readOnly) return void toast.info("View only - sign in to make changes.");
    fn();
  }

  function onAdd() {
    guard(() => {
      setEditing(null);
      setTxnDialogOpen(true);
    });
  }

  function onEdit(t: TransactionRow) {
    guard(() => {
      setEditing(t);
      setTxnDialogOpen(true);
    });
  }

  function onDelete(t: TransactionRow) {
    guard(() => {
      if (!window.confirm(`Delete "${t.description}"? This removes it everywhere.`)) return;
      setBusyId(t.id);
      deleteTransaction(t.id).then((res) => {
        setBusyId(null);
        if (!res.ok) return void toast.error(res.error ?? "Failed to delete.");
        toast.success("Transaction deleted.");
        router.refresh();
      });
    });
  }

  const shareFor = (t: TransactionRow) =>
    person?.debtorId ? linksByTxn.get(t.id)?.find((l) => l.debtor_id === person.debtorId)?.share ?? null : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl"
          style={{ maxHeight: "90dvh" }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>{person ? `Transactions with ${person.name}` : "Transactions"}</DialogTitle>
            <DialogDescription>
              {person && Math.abs(person.net) > 0.005 ? (
                <>
                  Net{" "}
                  <span className={person.net > 0 ? "text-positive" : "text-negative"}>
                    {fmtMoney(Math.abs(person.net), { cents: true })} {person.net > 0 ? "owed to you" : "you owe"}
                  </span>
                  . Everything here also lives on the Transactions page.
                </>
              ) : (
                "Everything here also lives on the Transactions page."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto -mr-2 pr-2">
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No transactions with this person yet. Add one below.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {rows.map((t) => {
                  const cat = t.category_id ? catById.get(t.category_id) : undefined;
                  const tag = tagFor(t);
                  const share = shareFor(t);
                  const owed = tag.tone === "owed"; // they owe you: your money, coming back
                  const owe = tag.tone === "owe"; // you owe them: a liability
                  // In your favor (they owe you) reads green and +; what you owe
                  // reads red and -. Splits lead with this person's share (the
                  // full expense sits just below).
                  const primaryValue = owed
                    ? Math.abs(share ?? t.amount)
                    : owe
                      ? -Math.abs(t.amount)
                      : signed(t);
                  return (
                    <div key={t.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{t.description}</span>
                          {tag.label ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "shrink-0 text-[10px]",
                                tag.tone === "owed" && "text-positive",
                                tag.tone === "owe" && "text-negative",
                              )}
                            >
                              {tag.label}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <span className="tnum">{fmtDate(t.txn_date, "short")}</span>
                          {cat ? (
                            <>
                              <span className="opacity-40">·</span>
                              <span className="inline-flex shrink-0 items-center gap-1">
                                <span className="size-1.5 rounded-full" style={{ background: hueColor(cat.color_hue) }} />
                                {cat.name}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Money
                          value={primaryValue}
                          cents
                          sign
                          colored={!owed && !owe}
                          className={cn("text-sm font-semibold", owed && "text-positive", owe && "text-negative")}
                        />
                        {share != null ? (
                          <div className="text-[10px] text-muted-foreground tnum">
                            of {fmtMoney(t.amount, { cents: true })}
                          </div>
                        ) : null}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7 shrink-0" disabled={busyId === t.id}>
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 sm:justify-between">
            <Button variant="outline" className="gap-1.5" onClick={onAdd}>
              <Plus className="size-4" /> Add transaction
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionDialog
        open={txnDialogOpen}
        onOpenChange={setTxnDialogOpen}
        lookups={lookups}
        existing={editing}
        existingPeople={editing ? linksByTxn.get(editing.id) ?? null : null}
      />
    </>
  );
}
