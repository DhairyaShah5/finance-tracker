"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownLeft, ArrowUpRight, Check, IndianRupee, Minus, MoreHorizontal, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { fmtDate, fmtInr, fmtNumber } from "@/lib/format";
import { fxSummary } from "@/lib/calc";
import { cn } from "@/lib/utils";
import type { IndiaTransferRow } from "@/lib/database.types";
import { TransferDialog } from "./transfer-dialog";
import { useReadOnly } from "@/components/read-only-context";
import { deleteTransfer } from "./actions";

const VIEW_ONLY = "View only - sign in to make changes.";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Tiny square checkbox used to include/exclude a transfer from the net-worth
 *  math. Renders a dash when the header toggle is in a partial state. */
function CheckBox({
  checked,
  indeterminate,
  onClick,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked || indeterminate
          ? "border-primary bg-primary text-white"
          : "border-muted-foreground/40 hover:border-muted-foreground",
      )}
    >
      {indeterminate ? <Minus className="size-3" /> : checked ? <Check className="size-3" /> : null}
    </button>
  );
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
  boxShadow: "0 6px 16px -8px rgb(0 0 0 / 0.25)",
};

const AXIS = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

function effectiveRate(t: IndiaTransferRow): number | null {
  if (t.effective_fx_rate != null) return t.effective_fx_rate;
  return t.usd_amount > 0 ? t.inr_amount / t.usd_amount : null;
}

function FxRateChart({ transfers }: { transfers: IndiaTransferRow[] }) {
  const data = transfers
    .map((t) => ({
      label: fmtDate(t.transfer_date, "short"),
      rate: effectiveRate(t),
    }))
    .filter((d): d is { label: string; rate: number } => d.rate != null);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis
          {...AXIS}
          width={48}
          domain={["dataMin - 1", "dataMax + 1"]}
          tickFormatter={(v: number) => fmtNumber(v, 1)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => [`${fmtNumber(Number(value), 2)} ₹/$`, "Rate"]}
        />
        <Line
          type="monotone"
          dataKey="rate"
          name="Rate"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function IndiaView({
  transfers,
  usAssets,
}: {
  transfers: IndiaTransferRow[];
  usAssets: number;
}) {
  const router = useRouter();

  const [direction, setDirection] = React.useState("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<IndiaTransferRow | null>(null);
  // Transfers the user has ticked OFF the net-worth math. Empty = all counted,
  // so brand-new transfers are always included by default.
  const [excluded, setExcluded] = React.useState<Set<string>>(() => new Set());

  // Headline totals reflect *every* transfer - they're the raw ledger record.
  const summary = React.useMemo(() => fxSummary(transfers), [transfers]);

  // Net debt & net worth, by contrast, only count the transfers still ticked.
  // Received money came from India (a debt you carry); sending it back pays that
  // debt down, so net debt = received − sent.
  const netDebt = React.useMemo(() => {
    const s = fxSummary(transfers.filter((t) => !excluded.has(t.id)));
    return round2(s.totalReceivedUsd - s.totalSentUsd);
  }, [transfers, excluded]);
  // Your true, all-in net worth: US assets minus what you still owe to India.
  const totalNetWorth = round2(usAssets - netDebt);
  const excludedCount = excluded.size;

  function toggleOne(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setExcluded((prev) => (prev.size === 0 ? new Set(transfers.map((t) => t.id)) : new Set()));
  }

  const filtered = React.useMemo(() => {
    return transfers
      .filter((t) => direction === "all" || t.direction === direction)
      .slice()
      .sort((a, b) =>
        a.transfer_date < b.transfer_date
          ? 1
          : a.transfer_date > b.transfer_date
            ? -1
            : b.created_at.localeCompare(a.created_at),
      );
  }, [transfers, direction]);

  const readOnly = useReadOnly();

  function onAdd() {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setEditing(null);
    setDialogOpen(true);
  }
  function onEdit(t: IndiaTransferRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setEditing(t);
    setDialogOpen(true);
  }
  function onDelete(t: IndiaTransferRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    if (!window.confirm(`Delete "${t.description}"?`)) return;
    deleteTransfer(t.id).then((res) => {
      if (!res.ok) toast.error(res.error ?? "Failed to delete.");
      else {
        toast.success("Transfer deleted.");
        router.refresh();
      }
    });
  }

  const empty = transfers.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="India Transfers"
        description="Money moved between USD and INR, and the rate you got."
        actions={
          <Button onClick={onAdd} className="gap-1.5">
            <Plus className="size-4" /> Add transfer
          </Button>
        }
      />

      {empty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <IndianRupee className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No transfers yet</p>
              <p className="text-sm text-muted-foreground">
                Add your first USD↔INR transfer to track effective exchange rates over time.
              </p>
            </div>
            <Button onClick={onAdd} className="mt-1 gap-1.5">
              <Plus className="size-4" /> Add transfer
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Total net worth hero - US assets netted against the India debt */}
          <Card className="surface overflow-hidden">
            <CardContent className="flex flex-col gap-2 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
                    Total net worth
                  </p>
                  <Money
                    value={totalNetWorth}
                    cents
                    colored
                    className="mt-1 block text-3xl font-semibold tracking-tight sm:text-4xl"
                  />
                </div>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm shadow-primary/30 grad-brand">
                  <Wallet className="size-4" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                US assets{" "}
                <Money value={usAssets} cents className="font-medium text-foreground/80" /> − India net
                debt <Money value={netDebt} cents className="font-medium text-foreground/80" />
                {excludedCount > 0
                  ? ` · ${excludedCount} transfer${excludedCount > 1 ? "s" : ""} excluded`
                  : ""}
              </p>
            </CardContent>
          </Card>

          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total received"
              value={<Money value={summary.totalReceivedUsd} cents />}
              hint={fmtInr(summary.totalReceivedInr)}
              accent="negative"
              icon={<ArrowDownLeft className="size-4" />}
            />
            <StatCard
              label="Total sent"
              value={<Money value={summary.totalSentUsd} cents />}
              hint={fmtInr(summary.totalSentInr)}
              accent="positive"
              icon={<ArrowUpRight className="size-4" />}
            />
            <StatCard
              label="Net debt"
              value={<Money value={netDebt} cents />}
              hint={
                excludedCount > 0
                  ? `Received − sent · ${excludedCount} excluded`
                  : "Received − sent · owed to India"
              }
              accent={netDebt > 0 ? "negative" : "positive"}
            />
            <StatCard
              label="Avg received rate"
              value={
                summary.avgReceivedRate != null
                  ? `${fmtNumber(summary.avgReceivedRate, 2)} ₹/$`
                  : "-"
              }
              hint={
                summary.avgSentRate != null
                  ? `Sent at ${fmtNumber(summary.avgSentRate, 2)} ₹/$`
                  : "Weighted INR per USD"
              }
              icon={<IndianRupee className="size-4" />}
            />
          </div>

          {/* FX rate over time */}
          {transfers.length >= 2 ? (
            <Card>
              <CardHeader>
                <CardTitle>Effective FX rate over time</CardTitle>
              </CardHeader>
              <CardContent>
                <FxRateChart transfers={transfers} />
              </CardContent>
            </Card>
          ) : null}

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2">
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All directions</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 pr-0">
                    <CheckBox
                      checked={excluded.size === 0}
                      indeterminate={excluded.size > 0 && excluded.size < transfers.length}
                      onClick={toggleAll}
                      label="Include or exclude all transfers from net worth"
                    />
                  </TableHead>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead className="w-28">Direction</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="hidden md:table-cell">Endpoint</TableHead>
                  <TableHead className="text-right">USD</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">INR</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="hidden text-muted-foreground lg:table-cell">Notes</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                      No transfers match your filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((t) => {
                    const rate = effectiveRate(t);
                    const received = t.direction === "received";
                    const included = !excluded.has(t.id);
                    return (
                      <TableRow key={t.id} className={cn(!included && "opacity-45")}>
                        <TableCell className="pr-0">
                          <CheckBox
                            checked={included}
                            onClick={() => toggleOne(t.id)}
                            label={`${included ? "Exclude" : "Include"} ${t.description} ${
                              included ? "from" : "in"
                            } net worth`}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground tnum">
                          {fmtDate(t.transfer_date, "short")}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={received ? "text-negative" : "text-positive"}
                          >
                            {received ? (
                              <ArrowDownLeft className="size-3" />
                            ) : (
                              <ArrowUpRight className="size-3" />
                            )}
                            {received ? "Received" : "Sent"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{t.description}</TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                          {t.endpoint ?? "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Money value={t.usd_amount} cents className="font-medium" />
                        </TableCell>
                        <TableCell className="hidden text-right text-sm text-muted-foreground tnum sm:table-cell">
                          {fmtInr(t.inr_amount)}
                        </TableCell>
                        <TableCell className="text-right tnum">
                          {rate != null ? fmtNumber(rate, 2) : "-"}
                        </TableCell>
                        <TableCell className="hidden max-w-40 truncate text-sm text-muted-foreground lg:table-cell">
                          {t.notes ?? "-"}
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
            <span>{filtered.length} transfers</span>
            <span className="flex gap-4">
              <span>
                Received{" "}
                <Money value={summary.totalReceivedUsd} cents className="font-medium text-negative" />
              </span>
              <span>
                Sent <Money value={summary.totalSentUsd} cents className="font-medium text-positive" />
              </span>
            </span>
          </div>
        </>
      )}

      <TransferDialog open={dialogOpen} onOpenChange={setDialogOpen} existing={editing} />
    </div>
  );
}
