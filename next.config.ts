import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs (dynamic requires) and sharp (native binary) must load from
  // node_modules at runtime rather than being bundled - the Vercel-safe treatment.
  serverExternalPackages: ["exceljs", "sharp"],
};

export default nextConfig;
