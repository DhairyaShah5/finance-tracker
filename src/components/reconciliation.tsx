import { Money } from "@/components/money";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Reconciliation } from "@/lib/calc";

interface Line {
  label: string;
  hint?: string;
  value: number; // signed: positive adds, negative subtracts
  op: "" | "+" | "−" | "=";
  tone?: "positive" | "negative" | "neutral" | "muted";
  strong?: boolean;
}

/**
 * Renders the cash identity as a waterfall that closes to the current balance:
 *   Starting funds + Income − Spending − Savings − Net fronted = Available funds.
 * Arrival capital is your STARTING funds, not income, so it gets its own row on
 * the money-in side (Income is only what you earned). Every dollar is in exactly
 * one row, so it always sums to the bottom line.
 */
export function ReconciliationFlow({ data }: { data: Reconciliation }) {
  const hasArrival = data.arrivalCapital > 0;
  const lines: Line[] = [
    ...(hasArrival
      ? [
          {
            label: "Starting funds",
            hint: `The ${fmtMoney(data.arrivalCapital)} of capital you arrived with`,
            value: data.arrivalCapital,
            op: "" as const,
            tone: "positive" as const,
          },
          {
            label: "Income",
            hint: "Paychecks and other income you earned",
            value: data.income,
            op: "+" as const,
            tone: "positive" as const,
          },
        ]
      : [
          {
            label: "Income",
            hint: "Paychecks and other income you earned",
            value: data.income,
            op: "" as const,
            tone: "positive" as const,
          },
        ]),
    { label: "Spending", hint: "Your net share of consumption", value: -data.spending, op: "−", tone: "negative" },
    { label: "Savings", hint: "Investments + vault, set aside", value: -data.savings, op: "−", tone: "muted" },
    ...(data.reimbursable > 0
      ? [
          {
            label: "Owed back",
            hint: "Reimbursable expenses not yet paid back",
            value: -data.reimbursable,
            op: "−" as const,
            tone: "muted" as const,
          },
        ]
      : []),
    // Difference between your logged activity and your actual account balances.
    // A non-zero value usually means an account balance needs correcting (e.g. a
    // credit-card balance that drifted). Its own line so "Spending" above stays
    // exactly the sum of your categories.
    ...(Math.abs(data.settled) >= 0.01
      ? [
          {
            label: "Unreconciled",
            hint: "Logged activity vs. your actual balances",
            value: -data.settled,
            op: (-data.settled >= 0 ? "+" : "−") as "+" | "−",
            tone: "muted" as const,
          },
        ]
      : []),
    { label: "Available funds", hint: "What you can spend now", value: data.currentBalance, op: "=", tone: "neutral", strong: true },
  ];

  const flow = lines.filter((l) => !l.strong);
  const total = lines.find((l) => l.strong)!;

  const row = (l: Line) => (
    <div key={l.label} className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-baseline gap-2.5">
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
            l.op === "+" && "bg-positive/10 text-positive",
            l.op === "−" && "bg-negative/10 text-negative",
            l.op === "" && "bg-muted text-muted-foreground",
          )}
        >
          {l.op || "›"}
        </span>
        <div>
          <p className="text-sm font-medium">{l.label}</p>
          {l.hint ? <p className="text-xs text-muted-foreground">{l.hint}</p> : null}
        </div>
      </div>
      <Money
        value={Math.abs(l.value)}
        cents
        className={cn(
          "shrink-0 text-sm font-semibold tnum",
          l.tone === "positive" && "text-positive",
          l.tone === "negative" && "text-negative",
          l.tone === "muted" && "text-muted-foreground",
        )}
      />
    </div>
  );

  return (
    <div>
      <div className="divide-y divide-border/60">{flow.map(row)}</div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-primary/[0.06] px-3.5 py-3 ring-1 ring-primary/15">
        <div className="flex items-baseline gap-2.5">
          <span className="flex size-5 items-center justify-center rounded-md grad-brand text-xs font-bold text-white">=</span>
          <div>
            <p className="text-sm font-semibold">{total.label}</p>
            {total.hint ? <p className="text-xs text-muted-foreground">{total.hint}</p> : null}
          </div>
        </div>
        <Money value={total.value} cents className="shrink-0 text-lg font-bold tnum grad-text" />
      </div>
    </div>
  );
}
