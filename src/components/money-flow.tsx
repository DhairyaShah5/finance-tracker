"use client";

import { ResponsiveContainer, Sankey } from "recharts";
import { fmtMoney, hueColor } from "@/lib/format";
import type { FlowNode, MoneyFlow } from "@/lib/calc";

// Fixed colors for the semantic buckets; source/spend/save nodes color by hue.
const COLOR = {
  hub: "oklch(0.68 0.16 285)",
  spend: "oklch(0.70 0.15 35)", // representative warm (legend swatch only)
  save: "oklch(0.72 0.13 155)",
  owed: "oklch(0.80 0.13 85)",
  kept: "oklch(0.72 0.10 235)",
  gap: "oklch(0.62 0.02 260)",
} as const;

function nodeColor(n: FlowNode): string {
  switch (n.group) {
    case "hub":
      return COLOR.hub;
    case "owed":
      return COLOR.owed;
    case "kept":
      return COLOR.kept;
    case "gap":
      return COLOR.gap;
    case "save":
      return hueColor(n.hue ?? 155);
    case "spend":
      return hueColor(n.hue ?? 30);
    default:
      return hueColor(n.hue ?? 250); // source
  }
}

// Recharts injects these into the custom node/link renderers; the payload
// carries our own FlowNode fields plus the computed throughput value.
interface NodeRenderProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: FlowNode & { value: number };
}
interface LinkRenderProps {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourceControlX: number;
  targetControlX: number;
  linkWidth: number;
  index: number;
  payload: { value: number; source: FlowNode; target: FlowNode };
}

function FlowNodeShape({ x, y, width, height, payload }: NodeRenderProps) {
  const color = nodeColor(payload);
  const cy = y + height / 2;
  const amount = fmtMoney(payload.value, { cents: false });

  if (payload.group === "hub") {
    // Middle pool: label sits above the tall bar so it clears the ribbons.
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={3} fill={color} />
        <text
          x={x + width / 2}
          y={y - 16}
          textAnchor="middle"
          className="text-[11px] font-semibold"
          style={{ fill: "var(--foreground)" }}
        >
          {payload.name}
        </text>
        <text
          x={x + width / 2}
          y={y - 4}
          textAnchor="middle"
          className="text-[10px] tabular-nums"
          style={{ fill: "var(--muted-foreground)" }}
        >
          {amount}
        </text>
      </g>
    );
  }

  const isSource = payload.group === "source";
  const tx = isSource ? x - 8 : x + width + 8;
  const anchor = isSource ? "end" : "start";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={2.5} fill={color} />
      <text x={tx} y={cy} textAnchor={anchor} dominantBaseline="middle" className="text-[11px]">
        <tspan className="font-medium" style={{ fill: "var(--foreground)" }}>{payload.name}</tspan>
        <tspan className="tabular-nums" style={{ fill: "var(--muted-foreground)" }}> {amount}</tspan>
      </text>
    </g>
  );
}

function FlowLinkShape({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceControlX,
  targetControlX,
  linkWidth,
  payload,
}: LinkRenderProps) {
  // Ribbon takes the color of where the money went (the target).
  const d = `M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  return (
    <path
      d={d}
      fill="none"
      stroke={nodeColor(payload.target)}
      strokeWidth={Math.max(1, linkWidth)}
      strokeOpacity={0.4}
      className="money-flow-link"
    />
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

export function MoneyFlowSankey({ data }: { data: MoneyFlow }) {
  if (!data.links.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Not enough activity to chart the flow yet.</p>;
  }

  const groups = new Set(data.nodes.map((n) => n.group));
  const rightCount = data.nodes.filter((n) => n.group !== "source" && n.group !== "hub").length;
  const height = Math.min(580, Math.max(360, rightCount * 40 + 56));

  /* eslint-disable @typescript-eslint/no-explicit-any -- Recharts custom shapes are injected with untyped props */
  const renderNode = (props: any) => <FlowNodeShape {...(props as NodeRenderProps)} />;
  const renderLink = (props: any) => <FlowLinkShape {...(props as LinkRenderProps)} />;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <div>
      <style>{`.money-flow-link{transition:stroke-opacity .15s ease} .money-flow-link:hover{stroke-opacity:.72}`}</style>
      <ResponsiveContainer width="100%" height={height}>
        <Sankey
          data={data}
          node={renderNode}
          link={renderLink}
          nodeWidth={13}
          nodePadding={16}
          iterations={64}
          margin={{ top: 26, bottom: 10, left: 118, right: 142 }}
        />{/* labels + ribbons are fully custom; no axes/tooltip needed */}
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-xs">
        <LegendDot color={COLOR.spend} label="Spending" />
        {groups.has("save") ? <LegendDot color={COLOR.save} label="Savings" /> : null}
        {groups.has("owed") ? <LegendDot color={COLOR.owed} label="Owed to me" /> : null}
        {groups.has("kept") ? <LegendDot color={COLOR.kept} label="Still on hand" /> : null}
        {groups.has("gap") ? <LegendDot color={COLOR.gap} label="Unreconciled" /> : null}
        <span className="ml-auto text-muted-foreground/70">Ribbons take the color of where the money went</span>
      </div>
    </div>
  );
}
