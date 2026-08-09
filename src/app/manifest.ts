import type { MetadataRoute } from "next";

// Web app manifest. Next auto-injects <link rel="manifest">, so do NOT also set
// metadata.manifest. Colors match the app background (globals.css) so the iOS
// status-bar strip blends into the header; the icon carries the brand gradient.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finance Tracker",
    short_name: "Finances",
    description: "Personal cash-flow, budget, and rewards tracker.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAFCFE",
    theme_color: "#FAFCFE",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
