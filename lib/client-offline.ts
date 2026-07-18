// Browser-only offline storage: IndexedDB caches of recently loaded review
// cards and a queue of ratings made while offline. The pure rules
// (validation, dedupe, payload prep) live in lib/offline-review.ts.
//
// Data is local to this browser profile. It is keyed to the last signed-in
// account: when a different user signs in, the previous user's cached cards
// and queue are wiped (see ensureOfflineUser). The sync endpoint additionally
// verifies card ownership server-side, so a stale queue can never write to
// another account's cards.

import {
  isDuplicateAction,
  MAX_OFFLINE_CARDS,
  prepareSyncActions,
  serializeReviewCard,
  validateQueuedReviewAction,
  type OfflineReviewCard,
  type QueuedReviewAction,
  type ReviewCardSource,
  type SyncResponse,
} from "./offline-review";
import type { Rating } from "./srs";

const DB_NAME = "lexiglass-offline";
const DB_VERSION = 1;
const CARDS_STORE = "reviewCards";
const QUEUE_STORE = "reviewQueue";
const USER_KEY_STORAGE = "lexiglass_offline_user";
const LAST_SYNC_STORAGE = "lexiglass_offline_last_sync";

export function isOfflineStorageSupported(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isOfflineStorageSupported()) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CARDS_STORE)) db.createObjectStore(CARDS_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open offline storage."));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Offline storage transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Offline storage transaction aborted."));
  });
}

function getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error ?? new Error("Could not read offline storage."));
  });
}

/* ---------------- cached review cards ---------------- */

/** Caches the cards of a just-loaded review session for offline use. */
export async function saveOfflineReviewCards(cards: ReviewCardSource[]): Promise<void> {
  if (cards.length === 0) return;
  const db = await openDb();
  try {
    const now = new Date();
    const existing = await getAll<OfflineReviewCard>(db, CARDS_STORE);
    const tx = db.transaction(CARDS_STORE, "readwrite");
    const store = tx.objectStore(CARDS_STORE);
    for (const card of cards) store.put(serializeReviewCard(card, now));

    // Keep only the most recently saved MAX_OFFLINE_CARDS entries.
    const incomingIds = new Set(cards.map((c) => c.id));
    const kept = existing.filter((c) => !incomingIds.has(c.id));
    const overflow = kept.length + cards.length - MAX_OFFLINE_CARDS;
    if (overflow > 0) {
      kept
        .sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime())
        .slice(0, overflow)
        .forEach((c) => store.delete(c.id));
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function getOfflineReviewCards(): Promise<OfflineReviewCard[]> {
  const db = await openDb();
  try {
    const cards = await getAll<OfflineReviewCard>(db, CARDS_STORE);
    return cards.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  } finally {
    db.close();
  }
}

/* ---------------- offline rating queue ---------------- */

function makeActionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Queues a rating made while offline. Returns the queued action, or null when
 * it was invalid or already queued (duplicate protection).
 */
export async function queueOfflineReviewAction(input: {
  flashcardId: string;
  rating: Rating;
  reviewedAt?: Date;
}): Promise<QueuedReviewAction | null> {
  const action = validateQueuedReviewAction({
    id: makeActionId(),
    flashcardId: input.flashcardId,
    rating: input.rating,
    reviewedAt: (input.reviewedAt ?? new Date()).toISOString(),
  });
  if (!action) return null;

  const db = await openDb();
  try {
    const queue = await getAll<QueuedReviewAction>(db, QUEUE_STORE);
    if (isDuplicateAction(queue, action)) return null;
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put(action);
    await txDone(tx);
    return action;
  } finally {
    db.close();
  }
}

export async function getQueuedReviewActions(): Promise<QueuedReviewAction[]> {
  const db = await openDb();
  try {
    const queue = await getAll<unknown>(db, QUEUE_STORE);
    return prepareSyncActions(queue);
  } finally {
    db.close();
  }
}

export async function countQueuedActions(): Promise<number> {
  try {
    return (await getQueuedReviewActions()).length;
  } catch {
    return 0;
  }
}

async function removeQueuedActions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  try {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    for (const id of ids) store.delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export interface SyncOutcome {
  ok: boolean;
  applied: number;
  duplicates: number;
  rejected: number;
  conflicts: number;
  remaining: number;
  error?: string;
}

let syncInFlight: Promise<SyncOutcome> | null = null;

/**
 * Sends the queued ratings to the server and removes every action the server
 * settled (applied, duplicate, or permanently rejected). Failed requests keep
 * the queue intact for the next attempt. Concurrent calls share one request,
 * so a burst of "online" events can't double-sync.
 */
export function syncQueuedReviewActions(): Promise<SyncOutcome> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = doSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function doSync(): Promise<SyncOutcome> {
  let actions: QueuedReviewAction[];
  try {
    actions = await getQueuedReviewActions();
  } catch (e) {
    return { ok: false, applied: 0, duplicates: 0, rejected: 0, conflicts: 0, remaining: 0, error: message(e) };
  }
  if (actions.length === 0) return { ok: true, applied: 0, duplicates: 0, rejected: 0, conflicts: 0, remaining: 0 };

  let data: SyncResponse;
  try {
    const res = await fetch("/api/review/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions }),
    });
    const body = (await res.json().catch(() => ({}))) as Partial<SyncResponse> & { error?: string };
    if (!res.ok) {
      return {
        ok: false,
        applied: 0,
        duplicates: 0,
        rejected: 0,
        conflicts: 0,
        remaining: actions.length,
        error: body.error ?? `Sync failed (${res.status})`,
      };
    }
    data = {
      applied: body.applied ?? 0,
      duplicates: body.duplicates ?? 0,
      rejected: body.rejected ?? 0,
      conflicts: body.conflicts ?? 0,
      results: Array.isArray(body.results) ? body.results : [],
    };
  } catch {
    return {
      ok: false,
      applied: 0,
      duplicates: 0,
      rejected: 0,
      conflicts: 0,
      remaining: actions.length,
      error: "Could not reach the server. Your queue is kept for the next try.",
    };
  }

  // Every settled action leaves the queue — applied and duplicate succeeded,
  // rejected ones (deleted card, stale timestamp, foreign card) never will.
  const settled = data.results.filter((r) => r.status !== "conflict").map((r) => r.id);
  try {
    await removeQueuedActions(settled);
  } catch {
    /* queue cleanup failed — duplicates are caught server-side next time */
  }
  const remaining = await countQueuedActions();
  try {
    window.localStorage.setItem(LAST_SYNC_STORAGE, new Date().toISOString());
  } catch {
    /* ignore */
  }
  return {
    ok: true,
    applied: data.applied,
    duplicates: data.duplicates,
    rejected: data.rejected,
    conflicts: data.conflicts,
    remaining,
    ...(data.conflicts > 0 ? { error: `${data.conflicts} offline rating conflict requires your attention.` } : {}),
  };
}

export function getLastSyncAt(): Date | null {
  try {
    const v = window.localStorage.getItem(LAST_SYNC_STORAGE);
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/* ---------------- lifecycle ---------------- */

/** Wipes all cached cards, the action queue and offline metadata. */
export async function clearOfflineData(): Promise<void> {
  try {
    window.localStorage.removeItem(LAST_SYNC_STORAGE);
  } catch {
    /* ignore */
  }
  if (!isOfflineStorageSupported()) return;
  const db = await openDb();
  try {
    const tx = db.transaction([CARDS_STORE, QUEUE_STORE], "readwrite");
    tx.objectStore(CARDS_STORE).clear();
    tx.objectStore(QUEUE_STORE).clear();
    await txDone(tx);
  } finally {
    db.close();
  }
}

/**
 * Ties the offline cache to the signed-in account. If a different user signs
 * in on this browser, the previous user's offline data is cleared so nobody
 * reviews (or syncs) someone else's cards.
 */
export async function ensureOfflineUser(userKey: string): Promise<void> {
  let previous: string | null = null;
  try {
    previous = window.localStorage.getItem(USER_KEY_STORAGE);
  } catch {
    return;
  }
  if (previous === userKey) return;
  if (previous !== null) {
    await clearOfflineData().catch(() => {});
  }
  try {
    window.localStorage.setItem(USER_KEY_STORAGE, userKey);
  } catch {
    /* ignore */
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong with offline storage.";
}
