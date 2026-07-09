"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { ResponsiveContainer, Treemap } from "recharts";
import { fmtMoney, fmtDate, hueColor } from "@/lib/format";

export interface TreemapTxn {
  name: string;
  value: number;
  date: string;
}
export interface TreemapCat {
  id: string;
  name: string;
  hue: number | null;
  total: number;
  txns: TreemapTxn[];
}

// A single rendered tile - value drives the area, fill/label are ours.
interface TileNode {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  value: number;
  depth: number;
  index: number;
  fill?: string;
  date?: string;
}

function truncate(s: string, chars: number): string {
  return s.length > chars ? `${s.slice(0, Math.max(1, chars - 1))}…` : s;
}

export function SpendingTreemap({ data }: { data: TreemapCat[] }) {
  const [drill, setDrill] = React.useState<TreemapCat | null>(null);
  const [hover, setHover] = React.useState<{ name: string; value: number; date?: string } | null>(null);

  // Keep the drilled category in sync if the data changes underneath us.
  const active = drill ? data.find((c) => c.id === drill.id) ?? null : null;

  const grandTotal = React.useMemo(() => data.reduce((s, c) => s + c.total, 0), [data]);

  // Build the Recharts data for the current level, each row carrying its color.
  const rows = React.useMemo(() => {
    if (active) {
      const base = active.hue;
      return active.txns.map((t, i) => ({
        name: t.name,
        value: t.value,
        date: t.date,
        // vary lightness per tile so same-category bills stay distinct
        fill: hueColor(base ?? 250, 0.52 + ((i * 7) % 5) * 0.045, 0.12),
      }));
    }
    return data.map((c) => ({ name: c.name, value: c.total, fill: hueColor(c.hue, 0.6, 0.14) }));
  }, [active, data]);

  const colorByName = React.useMemo(() => new Map(rows.map((r) => [r.name, r.fill])), [rows]);

  if (!data.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No spending to explore yet.</p>;
  }

  const renderTile = (node: TileNode) => {
    const { x, y, width, height, name } = node;
    const fill = node.fill ?? colorByName.get(name) ?? "var(--muted)";
    const canLabel = width > 54 && height > 24;
    const canAmount = width > 54 && height > 42;
    const chars = Math.floor((width - 12) / 6.5);
    return (
      <g className={active ? "tm-tile" : "tm-tile tm-clickable"}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={5}
          fill={fill}
          stroke="var(--card)"
          strokeWidth={3}
        />
        {canLabel ? (
          <text x={x + 9} y={y + 19} className="text-[11px] font-semibold" style={{ fill: "#fff", pointerEvents: "none" }}>
            {truncate(name, chars)}
          </text>
        ) : null}
        {canAmount ? (
          <text
            x={x + 9}
            y={y + 34}
            className="text-[10px] tabular-nums"
            style={{ fill: "rgba(255,255,255,0.82)", pointerEvents: "none" }}
          >
            {fmtMoney(node.value, { cents: node.value < 100 })}
          </text>
        ) : null}
      </g>
    );
  };

  /* eslint-disable @typescript-eslint/no-explicit-any -- Recharts injects untyped node props */
  const content = (props: any) => renderTile(props as TileNode);
  const onClick = (node: any) => {
    if (active) return; // already inside a category
    const cat = data.find((c) => c.name === (node as TileNode).name);
    if (cat) {
      setHover(null);
      setDrill(cat);
    }
  };
  const onEnter = (node: any) => {
    const n = node as TileNode;
    setHover({ name: n.name, value: n.value, date: n.date });
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <div>
      <style>{`.tm-tile{transition:filter .12s ease}.tm-tile:hover{filter:brightness(1.14)}.tm-clickable{cursor:pointer}`}</style>

      {/* Breadcrumb + live hover detail */}
      <div className="mb-3 flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <button
          type="button"
          onClick={() => {
            setDrill(null);
            setHover(null);
          }}
          className={active ? "font-medium text-primary underline-offset-2 hover:underline" : "font-medium text-foreground"}
        >
          All spending
        </button>
        {active ? (
          <>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="font-medium text-foreground">{active.name}</span>
            <span className="text-xs text-muted-foreground">
              {active.txns.length} transaction{active.txns.length === 1 ? "" : "s"}
            </span>
          </>
        ) : null}
        <span className="ml-auto tabular-nums text-muted-foreground">
          {hover ? (
            <>
              <span className="font-medium text-foreground">{hover.name}</span>
              {" · "}
              {fmtMoney(hover.value, { cents: true })}
              {hover.date ? ` · ${fmtDate(hover.date, "short")}` : ""}
            </>
          ) : active ? (
            `${fmtMoney(active.total, { cents: true })} total`
          ) : (
            `${fmtMoney(grandTotal, { cents: true })} across ${data.length} categories`
          )}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={392}>
        <Treemap
          key={active ? active.id : "root"}
          data={rows}
          dataKey="value"
          aspectRatio={16 / 9}
          content={content}
          onClick={onClick}
          onMouseEnter={onEnter}
          onMouseLeave={() => setHover(null)}
          isAnimationActive
          animationDuration={450}
        />
      </ResponsiveContainer>

      <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        {active ? "Hover a tile for details · click “All spending” to zoom back out" : "Tile size = amount spent · click a category to zoom into its transactions"}
      </p>
    </div>
  );
}
