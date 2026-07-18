"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, GlassCard } from "@/components/ui";
import {
  clearOfflineData,
  countQueuedActions,
  getLastSyncAt,
  getOfflineReviewCards,
  isOfflineStorageSupported,
  syncQueuedReviewActions,
  type SyncOutcome,
} from "@/lib/client-offline";
import { formatDate } from "@/lib/client";

/**
 * Offline status + sync controls: cached-card count, queued-action count,
 * "Sync now" and "Clear offline data". Used on the dashboard and /offline.
 */
export default function OfflineSyncPanel() {
  const [supported, setSupported] = useState(true);
  const [online, setOnline] = useState(true);
  const [cachedCards, setCachedCards] = useState(0);
  const [queued, setQueued] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isOfflineStorageSupported()) {
      setSupported(false);
      return;
    }
    const [cards, count] = await Promise.all([
      getOfflineReviewCards().catch(() => []),
      countQueuedActions(),
    ]);
    setCachedCards(cards.length);
    setQueued(count);
    setLastSync(getLastSyncAt());
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh();
    const onOnline = () => {
      setOnline(true);
      void refresh();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh]);

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    try {
      const outcome: SyncOutcome = await syncQueuedReviewActions();
      if (!outcome.ok) {
        setMessage(outcome.error ?? "Sync failed — your queue is kept for the next try.");
      } else if (outcome.applied + outcome.duplicates + outcome.rejected + outcome.conflicts === 0) {
        setMessage("Nothing to sync.");
      } else {
        const parts = [`${outcome.applied} synced`];
        if (outcome.duplicates > 0) parts.push(`${outcome.duplicates} already synced`);
        if (outcome.rejected > 0) parts.push(`${outcome.rejected} skipped`);
        if (outcome.conflicts > 0) parts.push(`${outcome.conflicts} conflicted and kept in queue`);
        setMessage(parts.join(" · "));
      }
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function clearAll() {
    if (queued > 0 && !window.confirm(`Delete ${queued} unsynced offline ${queued === 1 ? "rating" : "ratings"} and all cached cards?`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await clearOfflineData();
      setMessage("Offline data cleared.");
    } catch {
      setMessage("Could not clear offline data.");
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Offline &amp; sync
        </h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${online ? "bg-teal-glow" : "bg-amber-400"}`}
          />
          {online ? "Online" : "Offline"}
        </span>
      </div>

      {!supported ? (
        <p className="mt-3 text-sm text-ink-muted">
          This browser doesn&apos;t support offline storage, so offline review isn&apos;t available.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 px-3 py-3 text-center">
              <p className="text-2xl font-semibold tabular-nums">{cachedCards}</p>
              <p className="mt-0.5 text-xs text-ink-muted">Cards cached for offline</p>
            </div>
            <div className="rounded-xl bg-white/5 px-3 py-3 text-center">
              <p className={`text-2xl font-semibold tabular-nums ${queued > 0 ? "text-amber-200" : ""}`}>
                {queued}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">Ratings waiting to sync</p>
            </div>
          </div>

          <p className="mt-3 text-xs text-ink-muted">
            Review cards are cached in this browser whenever you open a review session, so you can
            keep reviewing without a connection at{" "}
            <a href="/offline" className="underline underline-offset-2 hover:text-ink">/offline</a>.
            {lastSync && <> Last sync: {formatDate(lastSync)}.</>}
          </p>

          {message && (
            <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-xs" role="status">
              {message}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="ghost"
              className="!px-4 !py-2 !text-xs"
              onClick={syncNow}
              disabled={busy || !online || queued === 0}
            >
              Sync now
            </Button>
            <Button
              variant="danger"
              className="!px-4 !py-2 !text-xs"
              onClick={clearAll}
              disabled={busy || (cachedCards === 0 && queued === 0)}
            >
              Clear offline data
            </Button>
          </div>
        </>
      )}
    </GlassCard>
  );
}
