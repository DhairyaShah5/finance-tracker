"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "@/lib/format";

const AXIS = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

const moneyTick = (v: number) => fmtMoney(v, { cents: false });

interface TipPayload {
  name?: string;
  value?: number | string;
  color?: string;
  fill?: string;
  payload?: Record<string, unknown>;
}

/** Glassy, themed tooltip shared by every chart. */
export function ChartTooltip({
  active,
  payload,
  label,
  total,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string;
  total?: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-xl border border-border/70 bg-popover/85 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      {label ? <p className="mb-1.5 font-semibold">{label}</p> : null}
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => {
          const v = Number(p.value);
          const share = total ? ` · ${((v / total) * 100).toFixed(0)}%` : "";
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: p.color ?? p.fill }} />
              <span className="text-muted-foreground">{p.name}</span>
              <span className="ml-auto font-semibold tnum">{fmtMoney(v, { cents: true })}{share}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface SeriesPoint {
  label: string;
  [key: string]: string | number | null;
}

/** Smooth area trend (1–2 series). Used for balance / cumulative charts. */
export function TrendChart({
  data,
  series,
  height = 260,
  dots = false,
}: {
  data: SeriesPoint[];
  series: { key: string; name: string; color?: string; dashed?: boolean }[];
  height?: number;
  dots?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
        <defs>
          {series.map((s, i) => {
            const c = s.color ?? `var(--chart-${i + 1})`;
            return (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.4} />
                <stop offset="60%" stopColor={c} stopOpacity={0.12} />
                <stop offset="100%" stopColor={c} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} dy={4} />
        <YAxis {...AXIS} width={52} tickFormatter={moneyTick} />
        <Tooltip cursor={{ stroke: "var(--border)", strokeWidth: 1 }} content={<ChartTooltip />} />
        {series.map((s, i) => {
          const c = s.color ?? `var(--chart-${i + 1})`;
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={c}
              strokeWidth={2.5}
              strokeDasharray={s.dashed ? "5 5" : undefined}
              fill={`url(#grad-${s.key})`}
              fillOpacity={s.dashed ? 0.25 : 1}
              connectNulls={false}
              dot={
                dots
                  ? (p: { cx?: number; cy?: number; index?: number }) =>
                      p.cx == null || p.cy == null ? (
                        <g key={p.index} />
                      ) : (
                        // Opaque card-colored center so the line never shows through
                        // the hollow ring; both markers share one radius.
                        <circle
                          key={p.index}
                          cx={p.cx}
                          cy={p.cy}
                          r={5}
                          fill={s.dashed ? "var(--card)" : c}
                          stroke={s.dashed ? c : "var(--card)"}
                          strokeWidth={2}
                        />
                      )
                  : false
              }
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--background)" }}
              animationDuration={900}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Grouped/standalone bars (1–2 series). Used for monthly expenses vs budget. */
export function BarSeriesChart({
  data,
  series,
  height = 260,
  stacked = false,
}: {
  data: SeriesPoint[];
  series: { key: string; name: string; color?: string }[];
  height?: number;
  stacked?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
        <defs>
          {series.map((s, i) => {
            const c = s.color ?? `var(--chart-${i + 1})`;
            return (
              <linearGradient key={s.key} id={`bar-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={1} />
                <stop offset="100%" stopColor={c} stopOpacity={0.55} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} dy={4} />
        <YAxis {...AXIS} width={52} tickFormatter={moneyTick} />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4, radius: 8 }} content={<ChartTooltip />} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={`url(#bar-${s.key})`}
            stackId={stacked ? "stack" : undefined}
            radius={stacked ? (i === series.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]) : [6, 6, 0, 0]}
            maxBarSize={46}
            animationDuration={800}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

/** Donut breakdown (category / account composition). Hover a slice for its
 *  name, amount and share - so the wheel itself can be large. */
export function DonutChart({ data, height = 300 }: { data: DonutSlice[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="58%"
          outerRadius="92%"
          paddingAngle={2}
          cornerRadius={6}
          strokeWidth={0}
          animationDuration={800}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip total={total} />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
