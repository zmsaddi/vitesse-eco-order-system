"use client";

import { useEffect } from "react";

// Phase 5.5 — registers /sw.js on mount, production-only.
// Render nothing; side effect only. Mounted once inside the (app) tree
// after auth, so anonymous visitors don't register a worker they can't
// use meaningfully.

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const handler = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore registration failures — the app still works */
      });
    };
    if (document.readyState === "complete") {
      handler();
    } else {
      window.addEventListener("load", handler, { once: true });
    }
  }, []);
  return null;
}
