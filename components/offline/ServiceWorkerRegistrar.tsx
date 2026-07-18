"use client";

import { useEffect, useState } from "react";

/** Registers the PWA worker and lets the user activate an installed update. */
export default function ServiceWorkerRegistrar() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
        });
      });
    }).catch(() => {
      /* registration is best-effort — the app works fully without it */
    });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!waiting) return null;
  return (
    <div className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-violet-glow/40 bg-[#11162a]/95 px-4 py-3 text-sm shadow-xl lg:bottom-4" role="status">
      <span>A LexiGlass update is ready.</span>
      <button
        className="rounded-lg bg-violet-glow/20 px-3 py-1.5 font-semibold text-violet-100"
        onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}
      >
        Update now
      </button>
    </div>
  );
}
