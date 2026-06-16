"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltip } from "@/components/charts";
import { fmtMoney } from "@/lib/format";

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

/**
 * Donut with the total in the middle and a ranked legend (name · amount · %).
 * Far more useful than a bare ring. Rolls the long tail into "Other".
 */
export function DonutBreakdown({
  data,
  height = 210,
  maxItems = 7,
  centerLabel = "Total",
  emptyText = "Nothing to show.",
}: {
  data: DonutSlice[];
  height?: number;
  maxItems?: number;
  centerLabel?: string;
  emptyText?: string;
}) {
  const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, d) => s + d.value, 0);

  if (total <= 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  let slices = sorted;
  if (sorted.length > maxItems) {
    const top = sorted.slice(0, maxItems);
    const other = sorted.slice(maxItems).reduce((s, d) => s + d.value, 0);
    slices = [...top, { name: "Other", value: other, color: "var(--muted-foreground)" }];
  }

  return (
    <div>
      <div className="relative mx-auto w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="66%"
              outerRadius="92%"
              paddingAngle={2}
              cornerRadius={5}
              strokeWidth={0}
              animationDuration={700}
            >
              {slices.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
            {centerLabel}
          </span>
          <span className="text-xl font-bold tnum sm:text-2xl">{fmtMoney(total)}</span>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {slices.map((d) => {
          const p = total ? Math.round((d.value / total) * 100) : 0;
          return (
            <li key={d.name} className="flex items-center gap-2.5 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.name}</span>
              <span className="shrink-0 tnum font-medium">{fmtMoney(d.value, { cents: true })}</span>
              <span className="w-9 shrink-0 text-right tnum text-xs text-muted-foreground">{p}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
