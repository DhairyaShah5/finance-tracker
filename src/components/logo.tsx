// The Finance Tracker logo: a rising net-worth line with an apex node and a soft
// area fill, echoing the app's signature "climb" (net worth over time). Authored
// once here as raw SVG geometry so the exact same mark drives the sidebar, the
// login screen, and the generated app icon (src/lib/app-icon.tsx).

export const LOGO_VIEWBOX = "0 0 32 32";
export const LOGO_LINE = "M5 21 L12 15.5 L18 18 L27 8";
export const LOGO_AREA = "M5 21 L12 15.5 L18 18 L27 8 L27 25 L5 25 Z";
export const LOGO_APEX = { cx: 27, cy: 8, r: 2.6 };

/**
 * The mark only (no tile), inheriting `currentColor`. Drop it inside any colored
 * tile (e.g. a `grad-brand` square) and size it with a `className` like `size-5`.
 */
export function LogoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} fill="none" className={className} aria-hidden="true">
      <path d={LOGO_AREA} fill="currentColor" fillOpacity={0.18} />
      <path
        d={LOGO_LINE}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={LOGO_APEX.cx} cy={LOGO_APEX.cy} r={LOGO_APEX.r} fill="currentColor" />
    </svg>
  );
}
