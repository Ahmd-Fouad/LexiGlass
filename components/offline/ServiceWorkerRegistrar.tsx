"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (public/sw.js). Production-only: in dev
 * the worker's caching fights hot reload. Renders nothing.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration is best-effort — the app works fully without it */
    });
  }, []);

  return null;
}
