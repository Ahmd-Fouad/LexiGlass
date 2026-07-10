import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, toErrorResponse } from "@/lib/api-helpers";
import { applyRating, ratingWasCorrect } from "@/lib/srs";
import {
  isActionTimestampUsable,
  MAX_SYNC_ACTIONS,
  prepareSyncActions,
  type SyncActionResult,
} from "@/lib/offline-review";

/**
 * Applies a batch of SRS ratings that were queued while the user was offline.
 *
 * Safety rules:
 * - every card is verified to belong to the caller before anything is written;
 * - actions replay in chronological order so multiple offline ratings of one
 *   card evolve its SRS state the same way they would have online;
 * - the (userId, flashcardId, reviewedAt) triple acts as an idempotency key —
 *   re-sending a batch after a lost response reports duplicates instead of
 *   double-writing ReviewLogs;
 * - stale (>30 days) or future timestamps are rejected, never applied.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));

    if (!Array.isArray(body.actions) || body.actions.length === 0) {
      return badRequest("actions must be a non-empty array.");
    }
    if (body.actions.length > MAX_SYNC_ACTIONS) {
      return badRequest(`At most ${MAX_SYNC_ACTIONS} actions can be synced at once.`);
    }

    // Report invalid entries individually so the client can drop them.
    const valid = prepareSyncActions(body.actions);
    const validIds = new Set(valid.map((a) => a.id));
    const results: SyncActionResult[] = [];
    for (const raw of body.actions as unknown[]) {
      const id = typeof (raw as { id?: unknown })?.id === "string" ? ((raw as { id: string }).id) : null;
      if (!id || !validIds.has(id)) {
        results.push({ id: id ?? "unknown", status: "rejected", reason: "Invalid action shape." });
      }
    }

    const now = new Date();
    for (const action of valid) {
      if (!isActionTimestampUsable(action, now)) {
        results.push({ id: action.id, status: "rejected", reason: "Timestamp too old or in the future." });
        continue;
      }

      // Ownership check: the card must exist and belong to the caller.
      const card = await db.flashcard.findFirst({
        where: { id: action.flashcardId, userId },
      });
      if (!card) {
        results.push({ id: action.id, status: "rejected", reason: "Card not found." });
        continue;
      }

      const reviewedAt = new Date(action.reviewedAt);
      const existing = await db.reviewLog.findFirst({
        where: { userId, flashcardId: card.id, reviewedAt },
        select: { id: true },
      });
      if (existing) {
        results.push({ id: action.id, status: "duplicate" });
        continue;
      }

      // Schedule relative to when the card was actually rated offline.
      const next = applyRating(card, action.rating, reviewedAt);
      const wasCorrect = ratingWasCorrect(action.rating);
      await db.$transaction([
        db.flashcard.update({
          where: { id: card.id },
          data: {
            easeFactor: next.easeFactor,
            intervalDays: next.intervalDays,
            dueDate: next.dueDate,
            reviewCount: { increment: 1 },
            correctCount: { increment: wasCorrect ? 1 : 0 },
            incorrectCount: { increment: wasCorrect ? 0 : 1 },
            lapses: { increment: action.rating === "again" ? 1 : 0 },
            lastReviewedAt: reviewedAt,
          },
        }),
        db.reviewLog.create({
          data: {
            userId,
            flashcardId: card.id,
            rating: action.rating,
            wasCorrect,
            intervalBefore: card.intervalDays,
            intervalAfter: next.intervalDays,
            reviewedAt,
          },
        }),
      ]);
      results.push({ id: action.id, status: "applied" });
    }

    return NextResponse.json({
      applied: results.filter((r) => r.status === "applied").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      rejected: results.filter((r) => r.status === "rejected").length,
      results,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
