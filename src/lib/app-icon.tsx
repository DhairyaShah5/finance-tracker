import { ImageResponse } from "next/og";
import { LOGO_APEX, LOGO_AREA, LOGO_LINE, LOGO_VIEWBOX } from "@/components/logo";

/**
 * The app icon, generated at any size: the white Finance Tracker mark (rising
 * net-worth line + apex node, from src/components/logo.tsx) on the brand gradient
 * (matches `.grad-brand` in globals.css). Used by icon.tsx, apple-icon.tsx, and
 * the /icons/*.png routes so every size stays identical. Inline styles only
 * (an ImageResponse/Satori requirement).
 */
export function renderAppIcon(size: number): ImageResponse {
  const glyph = Math.round(size * 0.6);
  const radius = Math.round(size * 0.22);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radius,
          background: "linear-gradient(135deg, #9754ED, #525BE9 50%, #0E9BDB)",
        }}
      >
        <svg width={glyph} height={glyph} viewBox={LOGO_VIEWBOX} fill="none">
          <path d={LOGO_AREA} fill="#ffffff" fillOpacity={0.2} />
          <path
            d={LOGO_LINE}
            fill="none"
            stroke="#ffffff"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={LOGO_APEX.cx} cy={LOGO_APEX.cy} r={LOGO_APEX.r} fill="#ffffff" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
