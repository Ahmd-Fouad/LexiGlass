"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  countQueuedActions,
  ensureOfflineUser,
  syncQueuedReviewActions,
} from "@/lib/client-offline";

/**
 * Compact online/offline indicator for the app shell. Also owns two pieces of
 * offline plumbing that must run on every authenticated page:
 *  - scoping the offline cache to the signed-in user (wipes it on account switch);
 *  - auto-syncing the queued ratings when the connection comes back.
 */
export default function OfflineStatus({ userKey, className = "" }: { userKey: string; className?: string }) {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  const refreshQueue = useCallback(() => {
    void countQueuedActions().then(setQueued);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    void ensureOfflineUser(userKey).then(refreshQueue);

    function onOnline() {
      setOnline(true);
      // Connection is back: push queued offline ratings to the server.
      void syncQueuedReviewActions().then(refreshQueue);
    }
    function onOffline() {
      setOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [userKey, refreshQueue]);

  // Nothing to say in the common case: online with an empty queue.
  if (online && queued === 0) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-ink-muted ${className}`}>
        <span aria-hidden className="size-1.5 rounded-full bg-teal-glow" />
        Online
      </span>
    );
  }

  return (
    <Link
      href="/offline"
      className={`inline-flex items-center gap-1.5 text-xs ${
        online ? "text-ink-muted" : "text-amber-200"
      } underline-offset-2 hover:underline ${className}`}
      title={online ? "Open offline review & sync" : "You are offline — open offline review"}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${online ? "bg-teal-glow" : "bg-amber-400"}`}
      />
      {online ? "Online" : "Offline"}
      {queued > 0 && (
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 text-[10px] font-medium text-amber-200">
          {queued} to sync
        </span>
      )}
    </Link>
  );
}
