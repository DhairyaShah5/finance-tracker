"use client";

import * as React from "react";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Money value that animates from 0 to its target on mount (eased). */
export function CountUp({
  value,
  cents = false,
  sign = false,
  durationMs = 850,
  className,
}: {
  value: number;
  cents?: boolean;
  sign?: boolean;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    let startTs = 0;
    const from = 0;
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const t = Math.min(1, (ts - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span className={cn("tnum", className)}>{fmtMoney(display, { cents, sign })}</span>;
}
