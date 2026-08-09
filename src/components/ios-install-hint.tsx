"use client";

import * as React from "react";
import { Share, X } from "lucide-react";

const DISMISS_KEY = "ios-install-hint-dismissed";

/**
 * iOS Safari has no install prompt, so nudge the owner to add the app to the
 * home screen. Shows only in mobile Safari on iOS, when not already installed
 * (standalone) and not previously dismissed. Renders nothing on desktop,
 * Android, non-Safari iOS browsers, or inside the installed PWA.
 */
export function IosInstallHint() {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = !/crios|fxios|edgios/i.test(ua); // A2HS only works from Safari
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    if (isIOS && isSafari && !standalone && !dismissed) setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl border border-border bg-popover/90 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-sm shadow-xl backdrop-blur-md">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg grad-brand text-white [&_svg]:size-4">
        <Share />
      </span>
      <p className="flex-1 text-muted-foreground">
        Install this app: tap <span className="font-medium text-foreground">Share</span>, then{" "}
        <span className="font-medium text-foreground">Add to Home Screen</span>.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
