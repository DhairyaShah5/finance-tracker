"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "@/lib/format";
import type { MonthlyCashFlow } from "@/lib/calc";

const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;
const moneyTick = (v: number) => fmtMoney(v, { cents: false });

// Rounded rect that only rounds the data-end (the end away from the zero line):
// the top for a surplus bar, the bottom for a deficit bar.
function barPath(x: number, y: number, w: number, h: number, top: boolean): string {
  const r = Math.max(0, Math.min(4, w / 2, h));
  return top
    ? `M${x},${y + r}Q${x},${y} ${x + r},${y}L${x + w - r},${y}Q${x + w},${y} ${x + w},${y + r}L${x + w},${y + h}L${x},${y + h}Z`
    : `M${x},${y}L${x + w},${y}L${x + w},${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}L${x + r},${y + h}Q${x},${y + h} ${x},${y + h - r}Z`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts injects untyped bar props
function DivergingBar(props: any) {
  const { x, y, width, height, payload } = props;
  const surplus = (payload?.net ?? 0) >= 0;
  return <path d={barPath(x, y, width, height, surplus)} fill={surplus ? "var(--positive)" : "var(--negative)"} />;
}

function Row({ label, value, sign }: { label: string; value: number; sign?: "+" | "−" }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {sign ? `${sign} ` : ""}
        {fmtMoney(value, { cents: true })}
      </span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts tooltip payload is untyped
function CashFlowTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as MonthlyCashFlow;
  const surplus = d.net >= 0;
  return (
    <div className="min-w-52 rounded-xl border border-border/70 bg-popover/85 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      <p className="mb-1.5 font-semibold">{d.label}</p>
      <div className="flex flex-col gap-1">
        <Row label="Income" value={d.income} sign="+" />
        <Row label="Living expenses" value={d.expenses} sign="−" />
        <Row label="Investments" value={d.investments} sign="−" />
        <div className="my-1 h-px bg-border/70" />
        <div className="flex items-center justify-between gap-6 font-semibold">
          <span>{surplus ? "Surplus" : "Deficit"}</span>
          <span className="tabular-nums" style={{ color: surplus ? "var(--positive)" : "var(--negative)" }}>
            {fmtMoney(d.net, { cents: true, sign: true })}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CashFlowChart({ data, height = 280 }: { data: MonthlyCashFlow[]; height?: number }) {
  if (!data.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Not enough history to chart cash flow yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} dy={4} />
        <YAxis {...AXIS} width={52} tickFormatter={moneyTick} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4, radius: 8 }} content={<CashFlowTooltip />} />
        <Bar dataKey="net" shape={<DivergingBar />} maxBarSize={46} animationDuration={800} />
      </BarChart>
    </ResponsiveContainer>
  );
}
