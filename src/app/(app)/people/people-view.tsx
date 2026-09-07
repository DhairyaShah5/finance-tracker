"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  MoreHorizontal,
  Pencil,
  Plus,
  Scale,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { sumOwed, sumOwedByMe, type DebtorBalance, type CreditorBalance } from "@/lib/calc";
import { fmtMoney } from "@/lib/format";
import type { AccountRow, CategoryRow, DebtorRow, CreditorRow } from "@/lib/database.types";
import { useReadOnly } from "@/components/read-only-context";
import { DebtorDialog } from "./debtor-dialog";
import { SettleDialog } from "./settle-dialog";
import { CreditorDialog } from "./creditor-dialog";
import { RepayDialog } from "./repay-dialog";
import { deleteDebtor, deleteCreditor } from "./actions";

const VIEW_ONLY = "View only - sign in to make changes.";
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// One person, with both sides of the ledger folded together. A debtor row and a
// creditor row with the same name are the same human, so we can show a single
// net position ("owes you" minus "you owe") instead of listing them twice.
type Person = {
  key: string; // normalized name, used to match the two sides
  name: string;
  note: string | null;
  net: number; // owed to you − you owe (positive = they owe you)
  debtor: DebtorRow | null;
  creditor: CreditorRow | null;
  owed: number; // outstanding on the debtor side
  oweThem: number; // outstanding on the creditor side
};

export function PeopleView({
  debtorBalances,
  creditorBalances,
  accounts,
  categories,
}: {
  debtorBalances: DebtorBalance[];
  creditorBalances: CreditorBalance[];
  accounts: AccountRow[];
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const readOnly = useReadOnly();

  // Owed-to-me (debtor) dialog state
  const [debtorOpen, setDebtorOpen] = React.useState(false);
  const [editingDebtor, setEditingDebtor] = React.useState<DebtorRow | null>(null);
  const [settleOpen, setSettleOpen] = React.useState(false);
  const [settling, setSettling] = React.useState<DebtorBalance | null>(null);

  // I-owe (creditor) dialog state
  const [creditorOpen, setCreditorOpen] = React.useState(false);
  const [editingCreditor, setEditingCreditor] = React.useState<CreditorRow | null>(null);
  const [repayOpen, setRepayOpen] = React.useState(false);
  const [repaying, setRepaying] = React.useState<CreditorBalance | null>(null);

  const owed = sumOwed(debtorBalances);
  const oweThem = sumOwedByMe(creditorBalances);
  const net = round2(owed - oweThem);

  // Fold the two sides into one row per person, matched by name.
  const people = React.useMemo<Person[]>(() => {
    const map = new Map<string, Person>();
    const keyOf = (n: string) => n.trim().toLowerCase();
    const blank = (key: string, name: string): Person => ({
      key,
      name,
      note: null,
      net: 0,
      debtor: null,
      creditor: null,
      owed: 0,
      oweThem: 0,
    });
    for (const { debtor, outstanding } of debtorBalances) {
      const key = keyOf(debtor.name);
      const row = map.get(key) ?? blank(key, debtor.name);
      row.debtor = debtor;
      row.owed = outstanding;
      row.note = row.note ?? (debtor.note?.trim() || null);
      map.set(key, row);
    }
    for (const { creditor, outstanding } of creditorBalances) {
      const key = keyOf(creditor.name);
      const row = map.get(key) ?? blank(key, creditor.name);
      row.creditor = creditor;
      row.oweThem = outstanding;
      row.note = row.note ?? (creditor.note?.trim() || null);
      map.set(key, row);
    }
    const arr = [...map.values()];
    for (const p of arr) p.net = round2(p.owed - p.oweThem);
    // Largest "owes you" first, largest "you owe" last, settled in between.
    return arr.sort((a, b) => b.net - a.net);
  }, [debtorBalances, creditorBalances]);

  function guard(fn: () => void) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    fn();
  }

  function onDeleteDebtor(d: DebtorRow) {
    guard(() => {
      if (!window.confirm(`Delete the owed-to-you record for "${d.name}"?`)) return;
      deleteDebtor(d.id).then((res) => {
        if (!res.ok) toast.error(res.error ?? "Failed to delete.");
        else {
          toast.success("Removed.");
          router.refresh();
        }
      });
    });
  }

  function onDeleteCreditor(c: CreditorRow) {
    guard(() => {
      if (!window.confirm(`Delete the you-owe record for "${c.name}"?`)) return;
      deleteCreditor(c.id).then((res) => {
        if (!res.ok) toast.error(res.error ?? "Failed to delete.");
        else {
          toast.success("Removed.");
          router.refresh();
        }
      });
    });
  }

  // People with a live balance stay up top; anyone fully squared up drops to the
  // "Friends" section below so the main list only shows who still owes whom.
  const active = people.filter((p) => p.owed > 0.005 || p.oweThem > 0.005);
  const settled = people
    .filter((p) => p.owed <= 0.005 && p.oweThem <= 0.005)
    .sort((a, b) => a.name.localeCompare(b.name));

  function personRow(p: Person) {
    const both = !!p.debtor && !!p.creditor;
    const canSettle = p.owed > 0.005; // they owe you -> settle up
    const canRepay = p.oweThem > 0.005; // you owe them -> pay back
    // With both sides live, lead with whichever the net leans toward.
    const primary = canSettle && canRepay ? (p.net >= 0 ? "settle" : "repay") : canSettle ? "settle" : canRepay ? "repay" : null;
    const openSettle = () => guard(() => { if (p.debtor) { setSettling({ debtor: p.debtor, outstanding: p.owed }); setSettleOpen(true); } });
    const openRepay = () => guard(() => { if (p.creditor) { setRepaying({ creditor: p.creditor, outstanding: p.oweThem }); setRepayOpen(true); } });
    return (
      <TableRow key={p.key}>
        <TableCell className="font-medium">{p.name}</TableCell>
        <TableCell className="hidden max-w-[32ch] truncate text-sm text-muted-foreground sm:table-cell">
          {p.note?.trim() ? p.note : "-"}
        </TableCell>
        <TableCell className="text-right">
          <Money value={p.net} cents colored={Math.abs(p.net) > 0.005} className="font-medium" />
          {both && canSettle && canRepay ? (
            <div className="text-xs text-muted-foreground">
              {fmtMoney(p.owed, { cents: true })} owed · {fmtMoney(p.oweThem, { cents: true })} you owe
            </div>
          ) : p.net > 0.005 ? (
            <div className="text-xs text-muted-foreground">owes you</div>
          ) : p.net < -0.005 ? (
            <div className="text-xs text-muted-foreground">you owe</div>
          ) : null}
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            {primary === "settle" ? (
              <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={openSettle}>
                <HandCoins className="size-3.5" /> Settle up
              </Button>
            ) : primary === "repay" ? (
              <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={openRepay}>
                <HandCoins className="size-3.5" /> Pay back
              </Button>
            ) : (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-positive">Settled</span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canSettle ? (
                  <DropdownMenuItem onClick={openSettle}>
                    <HandCoins className="size-4" /> Settle up{both ? " (they owe you)" : ""}
                  </DropdownMenuItem>
                ) : null}
                {canRepay ? (
                  <DropdownMenuItem onClick={openRepay}>
                    <HandCoins className="size-4" /> Pay back{both ? " (you owe them)" : ""}
                  </DropdownMenuItem>
                ) : null}
                {canSettle || canRepay ? <DropdownMenuSeparator /> : null}
                {p.debtor ? (
                  <DropdownMenuItem onClick={() => guard(() => { setEditingDebtor(p.debtor); setDebtorOpen(true); })}>
                    <Pencil className="size-4" /> Edit{both ? " owed-to-you" : ""}
                  </DropdownMenuItem>
                ) : null}
                {p.creditor ? (
                  <DropdownMenuItem onClick={() => guard(() => { setEditingCreditor(p.creditor); setCreditorOpen(true); })}>
                    <Pencil className="size-4" /> Edit{both ? " you-owe" : ""}
                  </DropdownMenuItem>
                ) : null}
                {p.debtor ? (
                  <DropdownMenuItem variant="destructive" onClick={() => onDeleteDebtor(p.debtor!)}>
                    <Trash2 className="size-4" /> Delete{both ? " owed-to-you" : ""}
                  </DropdownMenuItem>
                ) : null}
                {p.creditor ? (
                  <DropdownMenuItem variant="destructive" onClick={() => onDeleteCreditor(p.creditor!)}>
                    <Trash2 className="size-4" /> Delete{both ? " you-owe" : ""}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        description="Money between you and other people - what they owe you, and what you owe them."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Owed to me"
          value={<Money value={owed} cents />}
          hint="Across everyone who owes you"
          icon={<ArrowDownLeft className="size-4" />}
          accent={owed > 0 ? "positive" : "default"}
        />
        <StatCard
          label="I owe"
          value={<Money value={oweThem} cents />}
          hint="Across everyone you owe"
          icon={<ArrowUpRight className="size-4" />}
          accent={oweThem > 0 ? "negative" : "default"}
          iconClassName={oweThem > 0 ? "bg-negative" : undefined}
        />
        <StatCard
          label="Net position"
          value={<Money value={net} cents colored={Math.abs(net) > 0.005} />}
          hint={net > 0.005 ? "In your favor" : net < -0.005 ? "You owe more overall" : "All square"}
          icon={<Scale className="size-4" />}
          accent={net > 0.005 ? "positive" : net < -0.005 ? "negative" : "default"}
          iconClassName={net < -0.005 ? "bg-negative" : undefined}
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">People</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus className="size-4" /> Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => guard(() => { setEditingDebtor(null); setDebtorOpen(true); })}>
                <ArrowDownLeft className="size-4" /> Someone who owes me
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => guard(() => { setEditingCreditor(null); setCreditorOpen(true); })}>
                <ArrowUpRight className="size-4" /> Someone I owe
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        {active.length === 0 ? (
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <Users className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {settled.length > 0
                ? "Everyone's squared up right now. Past friends are listed below."
                : "No money between you and anyone right now. Add someone when you front money for them, or when you borrow."}
            </p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Note</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>{active.map(personRow)}</TableBody>
          </Table>
        )}
      </Card>

      {/* Fully squared-up people - kept for history, out of the way. */}
      {settled.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Friends</CardTitle>
            <p className="text-sm text-muted-foreground">All squared up - nothing owed either way.</p>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Note</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>{settled.map(personRow)}</TableBody>
          </Table>
        </Card>
      ) : null}

      <DebtorDialog
        open={debtorOpen}
        onOpenChange={setDebtorOpen}
        existing={editingDebtor}
        accounts={accounts}
        categories={categories}
      />
      <SettleDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        debtor={settling?.debtor ?? null}
        owed={settling?.outstanding ?? 0}
        accounts={accounts}
      />
      <CreditorDialog
        open={creditorOpen}
        onOpenChange={setCreditorOpen}
        existing={editingCreditor}
        accounts={accounts}
        categories={categories}
      />
      <RepayDialog
        open={repayOpen}
        onOpenChange={setRepayOpen}
        creditor={repaying?.creditor ?? null}
        owed={repaying?.outstanding ?? 0}
        accounts={accounts}
      />
    </div>
  );
}
