import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs (dynamic requires) and @resvg/resvg-js (native binary) must load from
  // node_modules at runtime rather than being bundled - the Vercel-safe treatment.
  serverExternalPackages: ["exceljs", "@resvg/resvg-js"],
};

export default nextConfig;
