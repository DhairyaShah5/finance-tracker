import "server-only";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ROBOTO_REGULAR_B64, ROBOTO_BOLD_B64 } from "@/lib/fonts/roboto";

// Server-side chart rendering for the Excel export. Charts are hand-built SVG in
// the app's Aurora palette, then rasterized to PNG (exceljs can only embed images,
// not native charts). Text uses a common sans-serif; the same figures also live in
// the data tabs, so nothing is lost if a glyph fails to render.

// Logical canvas; rendered at 2x for crispness, embedded at logical size.
const W = 760;
const H = 380;
const SCALE = 2;

const SERIES = [
  "#4F46E5", "#7C3AED", "#06B6D4", "#0EA5E9", "#10B981",
  "#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6", "#F97316",
  "#6366F1", "#84CC16", "#EF4444", "#A855F7",
];
const POS = "#16A34A";
const NEG = "#DC2626";
const INK = "#0F172A";
const MUTED = "#64748B";
const GRID = "#E2E8F0";
const FONT = "Roboto";

export const chartColor = (i: number) => SERIES[i % SERIES.length];

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const usdShort = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1000) return `${s}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return `${s}$${Math.round(a)}`;
};

function niceStep(x: number) {
  const p = Math.pow(10, Math.floor(Math.log10(x || 1)));
  const f = (x || 1) / p;
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * p;
}
function axis(min: number, max: number, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const step = niceStep((max - min) / count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) out.push(Math.round(v * 100) / 100);
  return { lo, hi, out };
}

function wrap(body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>${body}</svg>`;
}
// resvg loads fonts by file path, so materialize the embedded Roboto to a temp
// file once (cached). Bundled font + loadSystemFonts:false => rendering is
// identical everywhere (Vercel has no system fonts), so labels can never silently
// drop again - the /tmp dir is writable in the serverless runtime.
let fontFilesCache: string[] | null = null;
function fontFiles(): string[] {
  if (fontFilesCache) return fontFilesCache;
  const dir = join(tmpdir(), "finance-tracker-fonts");
  mkdirSync(dir, { recursive: true });
  const reg = join(dir, "roboto-regular.ttf");
  const bold = join(dir, "roboto-bold.ttf");
  if (!existsSync(reg)) writeFileSync(reg, Buffer.from(ROBOTO_REGULAR_B64, "base64"));
  if (!existsSync(bold)) writeFileSync(bold, Buffer.from(ROBOTO_BOLD_B64, "base64"));
  fontFilesCache = [reg, bold];
  return fontFilesCache;
}
export function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Roboto" },
  });
  return Buffer.from(resvg.render().asPng());
}

// --- Donut with legend -------------------------------------------------------
export function donutSVG(segments: { label: string; value: number; color: string }[], centerLabel: string) {
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  const cx = 190, cy = H / 2 + 6, R = 130, r = 78;
  let a = -Math.PI / 2;
  let arcs = "";
  for (const s of segments) {
    const a1 = a + (s.value / total) * Math.PI * 2;
    const large = a1 - a > Math.PI ? 1 : 0;
    const x0 = cx + R * Math.cos(a), y0 = cy + R * Math.sin(a);
    const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const xi1 = cx + r * Math.cos(a1), yi1 = cy + r * Math.sin(a1);
    const xi0 = cx + r * Math.cos(a), yi0 = cy + r * Math.sin(a);
    arcs += `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${xi1.toFixed(2)} ${yi1.toFixed(2)} A${r} ${r} 0 ${large} 0 ${xi0.toFixed(2)} ${yi0.toFixed(2)} Z" fill="${s.color}"/>`;
    a = a1;
  }
  const center =
    `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${MUTED}">${esc(centerLabel)}</text>` +
    `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="700" fill="${INK}">${usdShort(total)}</text>`;
  // Legend (right side)
  const lx = 370;
  let ly = 44;
  let legend = "";
  for (const s of segments) {
    const pct = Math.round((s.value / total) * 100);
    legend +=
      `<rect x="${lx}" y="${ly - 10}" width="12" height="12" rx="3" fill="${s.color}"/>` +
      `<text x="${lx + 20}" y="${ly}" font-family="${FONT}" font-size="13" fill="${INK}">${esc(s.label)}</text>` +
      `<text x="${W - 16}" y="${ly}" text-anchor="end" font-family="${FONT}" font-size="13" fill="${MUTED}">${usd(s.value)} · ${pct}%</text>`;
    ly += 24;
  }
  return wrap(arcs + center + legend);
}

// --- Vertical bars (optionally diverging pos/neg) ----------------------------
export function barsSVG(
  bars: { label: string; value: number }[],
  opts: { color?: string; diverging?: boolean } = {},
) {
  const m = { top: 24, right: 20, bottom: 40, left: 60 };
  const pw = W - m.left - m.right, ph = H - m.top - m.bottom;
  const vals = bars.map((b) => b.value);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const ax = axis(lo, hi);
  const y = (v: number) => m.top + ph - ((v - ax.lo) / (ax.hi - ax.lo || 1)) * ph;
  const zeroY = y(0);
  let grid = "";
  for (const t of ax.out) {
    grid +=
      `<line x1="${m.left}" y1="${y(t).toFixed(1)}" x2="${m.left + pw}" y2="${y(t).toFixed(1)}" stroke="${GRID}"/>` +
      `<text x="${m.left - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${MUTED}">${usdShort(t)}</text>`;
  }
  const n = bars.length || 1;
  const slot = pw / n, bw = Math.min(46, slot * 0.62);
  let rects = "";
  bars.forEach((b, i) => {
    const cx = m.left + slot * i + slot / 2;
    const top = Math.min(y(b.value), zeroY), h = Math.abs(y(b.value) - zeroY);
    const fill = opts.diverging ? (b.value >= 0 ? POS : NEG) : (opts.color ?? SERIES[0]);
    rects +=
      `<rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="4" fill="${fill}"/>` +
      `<text x="${cx.toFixed(1)}" y="${H - m.bottom + 16}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${MUTED}">${esc(b.label)}</text>`;
  });
  const base = `<line x1="${m.left}" y1="${zeroY.toFixed(1)}" x2="${m.left + pw}" y2="${zeroY.toFixed(1)}" stroke="${MUTED}" stroke-width="1"/>`;
  return wrap(grid + base + rects);
}

// --- Line with area fill -----------------------------------------------------
export function lineSVG(points: { label: string; value: number }[]) {
  const m = { top: 24, right: 20, bottom: 40, left: 60 };
  const pw = W - m.left - m.right, ph = H - m.top - m.bottom;
  const vals = points.map((p) => p.value);
  const ax = axis(Math.min(...vals), Math.max(...vals));
  const n = points.length;
  const x = (i: number) => m.left + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
  const y = (v: number) => m.top + ph - ((v - ax.lo) / (ax.hi - ax.lo || 1)) * ph;
  let grid = "";
  for (const t of ax.out) {
    grid +=
      `<line x1="${m.left}" y1="${y(t).toFixed(1)}" x2="${m.left + pw}" y2="${y(t).toFixed(1)}" stroke="${GRID}"/>` +
      `<text x="${m.left - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${MUTED}">${usdShort(t)}</text>`;
  }
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  const area = `<path d="M${m.left},${(m.top + ph).toFixed(1)} L${pts.join(" L")} L${(m.left + pw).toFixed(1)},${(m.top + ph).toFixed(1)} Z" fill="${SERIES[0]}" fill-opacity="0.12"/>`;
  const line = `<polyline points="${pts.join(" ")}" fill="none" stroke="${SERIES[0]}" stroke-width="2.5" stroke-linejoin="round"/>`;
  let dots = "", labels = "";
  points.forEach((p, i) => {
    dots += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="${SERIES[0]}"/>`;
    // label every point if few, else every other
    if (n <= 8 || i % 2 === 0)
      labels += `<text x="${x(i).toFixed(1)}" y="${H - m.bottom + 16}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${MUTED}">${esc(p.label)}</text>`;
  });
  return wrap(grid + area + line + dots + labels);
}

// --- Stacked bars ------------------------------------------------------------
export function stackedBarsSVG(
  bars: { label: string; segments: number[] }[],
  legend: { label: string; color: string }[],
) {
  const m = { top: 24, right: 20, bottom: 54, left: 60 };
  const pw = W - m.left - m.right, ph = H - m.top - m.bottom;
  const totals = bars.map((b) => b.segments.reduce((s, v) => s + v, 0));
  const ax = axis(0, Math.max(1, ...totals));
  const y = (v: number) => m.top + ph - ((v - ax.lo) / (ax.hi - ax.lo || 1)) * ph;
  let grid = "";
  for (const t of ax.out) {
    grid +=
      `<line x1="${m.left}" y1="${y(t).toFixed(1)}" x2="${m.left + pw}" y2="${y(t).toFixed(1)}" stroke="${GRID}"/>` +
      `<text x="${m.left - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${MUTED}">${usdShort(t)}</text>`;
  }
  const n = bars.length || 1;
  const slot = pw / n, bw = Math.min(48, slot * 0.6);
  let rects = "";
  bars.forEach((b, i) => {
    const cx = m.left + slot * i + slot / 2;
    let acc = 0;
    b.segments.forEach((v, si) => {
      if (v <= 0) return;
      const y0 = y(acc), y1 = y(acc + v);
      rects += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, y0 - y1).toFixed(1)}" fill="${legend[si]?.color ?? SERIES[si]}"/>`;
      acc += v;
    });
    rects += `<text x="${cx.toFixed(1)}" y="${H - m.bottom + 16}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${MUTED}">${esc(b.label)}</text>`;
  });
  // legend row
  let lx = m.left, lg = "";
  for (const l of legend) {
    lg += `<rect x="${lx}" y="${H - 22}" width="12" height="12" rx="3" fill="${l.color}"/>` +
      `<text x="${lx + 18}" y="${H - 12}" font-family="${FONT}" font-size="12" fill="${INK}">${esc(l.label)}</text>`;
    lx += 28 + l.label.length * 7.4;
  }
  return wrap(grid + rects + lg);
}

// --- Horizontal bars ---------------------------------------------------------
export function hBarsSVG(bars: { label: string; value: number; color: string }[]) {
  const m = { top: 20, right: 84, bottom: 16, left: 150 };
  const pw = W - m.left - m.right, ph = H - m.top - m.bottom;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const n = bars.length || 1;
  const slot = ph / n, bh = Math.min(30, slot * 0.62);
  let out = "";
  bars.forEach((b, i) => {
    const cy = m.top + slot * i + slot / 2;
    const w = (b.value / max) * pw;
    out +=
      `<text x="${m.left - 10}" y="${(cy + 4).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${INK}">${esc(b.label)}</text>` +
      `<rect x="${m.left}" y="${(cy - bh / 2).toFixed(1)}" width="${Math.max(1, w).toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${b.color}"/>` +
      `<text x="${(m.left + w + 8).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-family="${FONT}" font-size="12" fill="${MUTED}">${usd(b.value)}</text>`;
  });
  return wrap(out);
}
