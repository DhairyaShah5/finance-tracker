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
 *   Income − Spending − Savings − Net fronted = Available funds.
 * Income includes the arrival capital (your early expenses came out of it).
 * Every dollar is in exactly one row, so it always sums to the bottom line.
 */
export function ReconciliationFlow({ data }: { data: Reconciliation }) {
  // Net fronted for friends is the balancing figure: positive = money went out
  // (paid for others, net of reimbursements); negative = net came back to you.
  const out = data.netToOthers;
  const lines: Line[] = [
    {
      label: "Income",
      hint: `Paychecks + the ${fmtMoney(data.arrivalCapital)} you arrived with`,
      value: data.income,
      op: "",
      tone: "positive",
    },
    { label: "Spending", hint: "Your share of consumption", value: -data.spending, op: "−", tone: "negative" },
    { label: "Savings", hint: "Investments + vault, set aside", value: -data.savings, op: "−", tone: "muted" },
    {
      label: "Fronted for friends (net)",
      hint: "Net of reimbursements, cashback & refunds — settles up informally",
      value: -out,
      op: out >= 0 ? "−" : "+",
      tone: "muted",
    },
    { label: "Available funds", hint: "What you can spend now", value: data.currentBalance, op: "=", tone: "neutral", strong: true },
  ];

  return (
    <div className="divide-y divide-border/60">
      {lines.map((l) => (
        <div
          key={l.label}
          className={cn("flex items-center justify-between gap-3 py-2", l.strong && "pt-2.5")}
        >
          <div className="flex items-baseline gap-2">
            <span className={cn("w-3 text-center text-sm tabular-nums text-muted-foreground", l.op === "=" && "text-foreground")}>
              {l.op}
            </span>
            <div>
              <p className={cn("text-sm", l.strong ? "font-semibold" : "font-medium")}>{l.label}</p>
              {l.hint ? <p className="text-xs text-muted-foreground">{l.hint}</p> : null}
            </div>
          </div>
          <Money
            value={Math.abs(l.value)}
            cents
            className={cn(
              "tnum shrink-0",
              l.strong ? "text-base font-semibold" : "text-sm font-medium",
              l.tone === "positive" && "text-positive",
              l.tone === "negative" && "text-negative",
              l.tone === "muted" && "text-muted-foreground",
            )}
          />
        </div>
      ))}
    </div>
  );
}
