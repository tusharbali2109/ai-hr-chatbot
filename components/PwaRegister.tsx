"use client";

import { useEffect } from "react";

/** Registers the service worker once, client-side only — required for
 * installability, otherwise inert (see public/sw.js's network-first
 * strategy; nothing here changes app behavior beyond making "Add to Home
 * Screen" available). */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Best-effort — a failed registration just means no install prompt.
      });
    }
  }, []);

  return null;
}
