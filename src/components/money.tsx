import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MoneyProps {
  value: number | null | undefined;
  cents?: boolean;
  sign?: boolean;
  /** Color green/red by sign of the value. */
  colored?: boolean;
  className?: string;
}

/** Tabular-figure money display with optional sign coloring. */
export function Money({ value, cents = false, sign = false, colored = false, className }: MoneyProps) {
  const v = value ?? 0;
  return (
    <span
      className={cn(
        "tnum",
        colored && v > 0 && "text-positive",
        colored && v < 0 && "text-negative",
        className,
      )}
    >
      {fmtMoney(v, { cents, sign })}
    </span>
  );
}
