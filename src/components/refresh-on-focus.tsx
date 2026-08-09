"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetch server data when the app returns to the foreground, so a reopened
 * home-screen PWA (or a refocused tab) shows current data without a manual
 * reload. Pages are force-dynamic, so router.refresh() re-runs the server
 * components and re-reads Supabase while keeping client state mounted.
 * Throttled to avoid refresh storms on rapid focus/blur. Renders nothing.
 */
export function RefreshOnFocus() {
  const router = useRouter();
  const last = React.useRef(0);

  React.useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last.current < 15000) return;
      last.current = now;
      router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  return null;
}
