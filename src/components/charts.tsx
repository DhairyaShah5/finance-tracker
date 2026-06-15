"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
  boxShadow: "0 6px 16px -8px rgb(0 0 0 / 0.25)",
};

const moneyTick = (v: number) => fmtMoney(v, { cents: false });

export interface SeriesPoint {
  label: string;
  [key: string]: string | number;
}

/** Smooth area trend (1–2 series). Used for balance / cumulative charts. */
export function TrendChart({
  data,
  series,
  height = 240,
}: {
  data: SeriesPoint[];
  series: { key: string; name: string; color?: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? `var(--chart-${i + 1})`} stopOpacity={0.25} />
              <stop offset="100%" stopColor={s.color ?? `var(--chart-${i + 1})`} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={52} tickFormatter={moneyTick} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [fmtMoney(Number(value), { cents: true }), String(name)]}
        />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color ?? `var(--chart-${i + 1})`}
            strokeWidth={2}
            fill={`url(#grad-${s.key})`}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Grouped/standalone bars (1–2 series). Used for monthly expenses vs budget. */
export function BarSeriesChart({
  data,
  series,
  height = 240,
  stacked = false,
}: {
  data: SeriesPoint[];
  series: { key: string; name: string; color?: string }[];
  height?: number;
  stacked?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={52} tickFormatter={moneyTick} />
        <Tooltip
          cursor={{ fill: "var(--secondary)", opacity: 0.5 }}
          contentStyle={tooltipStyle}
          formatter={(value, name) => [fmtMoney(Number(value), { cents: true }), String(name)]}
        />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={s.color ?? `var(--chart-${i + 1})`}
            stackId={stacked ? "stack" : undefined}
            radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
            maxBarSize={48}
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

/** Donut breakdown (category / account composition). No legend — hover a slice
 *  for its name, amount, and share — so the wheel itself can be large. */
export function DonutChart({ data, height = 300 }: { data: DonutSlice[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="55%"
          outerRadius="92%"
          paddingAngle={1.5}
          strokeWidth={0}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => {
            const v = Number(value);
            return [`${fmtMoney(v, { cents: true })} (${total ? ((v / total) * 100).toFixed(0) : 0}%)`, String(name)];
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
