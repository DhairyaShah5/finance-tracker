import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs uses Node built-ins and dynamic requires - keep it out of the bundle
  // and load it from node_modules at runtime (the Vercel-safe treatment).
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
