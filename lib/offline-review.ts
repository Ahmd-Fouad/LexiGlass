// Pure logic for offline review: card serialization, queued-action
// validation, duplicate prevention and sync-payload preparation.
//
// No IndexedDB or fetch in here — the browser glue lives in
// lib/client-offline.ts and the server side in /api/review/sync. Keeping this
// module pure lets the queue rules be unit-tested in Node.

import type { Rating } from "./srs";

export const RATINGS: readonly Rating[] = ["again", "hard", "good", "easy"];

/** Most cards kept for offline review (newest win). */
export const MAX_OFFLINE_CARDS = 100;
/** Most queued actions sent in one sync request (server enforces the same cap). */
export const MAX_SYNC_ACTIONS = 200;
/** Queued actions older than this are considered stale and rejected by the server. */
export const MAX_ACTION_AGE_DAYS = 30;
/** Small allowance for client/server clock skew on "future" timestamps. */
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Minimal card snapshot cached in IndexedDB for reviewing while offline. */
export interface OfflineReviewCard {
  id: string;
  text: string;
  kind: string;
  meaning: string;
  translation: string | null;
  example: string | null;
  notes: string | null;
  savedAt: string; // ISO — when this snapshot was cached
}

/** One SRS rating made while offline, waiting to be synced. */
export interface QueuedReviewAction {
  id: string; // client-generated unique id
  flashcardId: string;
  rating: Rating;
  reviewedAt: string; // ISO — when the user rated the card
}

/** Shape of the card fields the serializer needs (subset of CardDTO). */
export interface ReviewCardSource {
  id: string;
  text: string;
  kind: string;
  meaning: string;
  translation: string | null;
  example: string | null;
  notes: string | null;
}

/** Snapshot of a review card for the offline cache (front + back only, no SRS state). */
export function serializeReviewCard(card: ReviewCardSource, now: Date = new Date()): OfflineReviewCard {
  return {
    id: card.id,
    text: card.text,
    kind: card.kind,
    meaning: card.meaning,
    translation: card.translation ?? null,
    example: card.example ?? null,
    notes: card.notes ?? null,
    savedAt: now.toISOString(),
  };
}

function isNonEmptyString(v: unknown, maxLen: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLen;
}

/**
 * Validates an unknown value as a queued review action. Returns the clean
 * action or null. Used on both sides: before queueing/syncing on the client
 * and on every item the sync API receives.
 */
export function validateQueuedReviewAction(value: unknown): QueuedReviewAction | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isNonEmptyString(v.id, 64)) return null;
  if (!isNonEmptyString(v.flashcardId, 100)) return null;
  if (!RATINGS.includes(v.rating as Rating)) return null;
  if (typeof v.reviewedAt !== "string") return null;
  const at = new Date(v.reviewedAt);
  if (Number.isNaN(at.getTime())) return null;
  return {
    id: v.id,
    flashcardId: v.flashcardId,
    rating: v.rating as Rating,
    reviewedAt: at.toISOString(),
  };
}

/**
 * Whether the action's timestamp is usable: not further in the future than
 * clock skew allows and not older than MAX_ACTION_AGE_DAYS.
 */
export function isActionTimestampUsable(action: QueuedReviewAction, now: Date = new Date()): boolean {
  const at = new Date(action.reviewedAt).getTime();
  if (at > now.getTime() + MAX_FUTURE_SKEW_MS) return false;
  if (at < now.getTime() - MAX_ACTION_AGE_DAYS * DAY_MS) return false;
  return true;
}

/**
 * Duplicate check before queueing: same action id, or another rating of the
 * same card at the same timestamp (double-tap / double-queue protection).
 */
export function isDuplicateAction(
  queue: readonly QueuedReviewAction[],
  action: QueuedReviewAction
): boolean {
  return queue.some(
    (q) => q.id === action.id || (q.flashcardId === action.flashcardId && q.reviewedAt === action.reviewedAt)
  );
}

/**
 * Turns whatever came out of IndexedDB into a clean sync payload: validates
 * every item, drops duplicates, orders chronologically (so multiple ratings
 * of one card replay in the right order) and caps the batch size.
 */
export function prepareSyncActions(rawQueue: readonly unknown[]): QueuedReviewAction[] {
  const clean: QueuedReviewAction[] = [];
  for (const raw of rawQueue) {
    const action = validateQueuedReviewAction(raw);
    if (action && !isDuplicateAction(clean, action)) clean.push(action);
  }
  clean.sort((a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime());
  return clean.slice(0, MAX_SYNC_ACTIONS);
}

/** Per-action outcome reported by POST /api/review/sync. */
export interface SyncActionResult {
  id: string;
  status: "applied" | "duplicate" | "rejected";
  reason?: string;
}

export interface SyncResponse {
  applied: number;
  duplicates: number;
  rejected: number;
  results: SyncActionResult[];
}
