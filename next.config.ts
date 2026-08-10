import type { NextConfig } from "next";

// Baseline security headers applied to every response. We intentionally scope
// the CSP to `frame-ancestors 'none'` (clickjacking protection) rather than a
// full script/style policy, so it can't break Next's RSC/hydration inline
// scripts or the next-themes theme script. X-Frame-Options is the legacy twin.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // exceljs uses dynamic requires - keep it out of the bundle and load it from
  // node_modules at runtime (the Vercel-safe treatment).
  serverExternalPackages: ["exceljs"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
