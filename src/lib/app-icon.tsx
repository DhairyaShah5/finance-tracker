import { ImageResponse } from "next/og";

// The lucide "Wallet" glyph (the sidebar brand mark), hand-inlined so Satori can
// render it without the lucide React component / currentColor / CSS classes.
const WALLET_PATHS = [
  "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
  "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
];

/**
 * The app icon, generated at any size: the white Wallet glyph on the brand
 * gradient (matches `.grad-brand` in globals.css). Used by icon.tsx,
 * apple-icon.tsx, and the /icons/*.png routes so every size stays identical.
 * Inline styles only (an ImageResponse/Satori requirement).
 */
export function renderAppIcon(size: number): ImageResponse {
  const glyph = Math.round(size * 0.56);
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
        <svg
          width={glyph}
          height={glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {WALLET_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
