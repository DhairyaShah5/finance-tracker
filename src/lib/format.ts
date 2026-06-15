import { format, parseISO } from "date-fns";

/** Format a USD amount. Defaults to whole dollars; pass cents for precision. */
export function fmtMoney(
  n: number | null | undefined,
  opts: { cents?: boolean; sign?: boolean; currency?: string } = {},
): string {
  const { cents = false, sign = false, currency = "USD" } = opts;
  const value = n ?? 0;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(Math.abs(value));
  if (value < 0) return `-${formatted}`;
  if (sign && value > 0) return `+${formatted}`;
  return formatted;
}

/** Format an INR amount with the ₹ symbol and Indian digit grouping. */
export function fmtInr(n: number | null | undefined): string {
  const value = n ?? 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function fmtNumber(n: number | null | undefined, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n ?? 0);
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  return `${((n ?? 0) * 100).toFixed(digits)}%`;
}

type DateStyle = "short" | "medium" | "long" | "weekday" | "monthYear";

/** Format an ISO date string (yyyy-MM-dd) without timezone drift. */
export function fmtDate(iso: string | null | undefined, style: DateStyle = "medium"): string {
  if (!iso) return "—";
  const d = iso.length === 10 ? parseISO(iso) : new Date(iso);
  switch (style) {
    case "short":
      return format(d, "MMM d");
    case "long":
      return format(d, "MMMM d, yyyy");
    case "weekday":
      return format(d, "EEE, MMM d");
    case "monthYear":
      return format(d, "MMM yyyy");
    default:
      return format(d, "MMM d, yyyy");
  }
}

/** 'YYYY-MM' bucket key from an ISO date (no TZ math — slices the string). */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Human label for a 'YYYY-MM' month key, e.g. "Aug 2025". */
export function monthLabel(key: string): string {
  return format(parseISO(`${key}-01`), "MMM yyyy");
}

/** Consistent chart color from a stored category hue. */
export function hueColor(hue: number | null | undefined, lightness = 0.62, chroma = 0.13): string {
  const h = hue ?? 250;
  return `oklch(${lightness} ${chroma} ${h})`;
}
