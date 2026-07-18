import { NextResponse } from "next/server";
import { Prisma, type Flashcard } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, toErrorResponse } from "@/lib/api-helpers";
import { buildReviewTransition, reviewSnapshotData, reviewStateUpdate } from "@/lib/review-events";
import {
  isActionTimestampUsable,
  MAX_SYNC_ACTIONS,
  prepareSyncActions,
  type QueuedReviewAction,
  type SyncActionResult,
} from "@/lib/offline-review";

/** Applies a bounded offline batch in one serializable transaction. */
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

    const valid = prepareSyncActions(body.actions);
    const validIds = new Set(valid.map((a) => a.id));
    const initial: SyncActionResult[] = [];
    for (const raw of body.actions as unknown[]) {
      const id = typeof (raw as { id?: unknown })?.id === "string" ? (raw as { id: string }).id : null;
      if (!id || !validIds.has(id)) initial.push({ id: id ?? "unknown", status: "rejected", reason: "Invalid action shape." });
    }

    const now = new Date();
    const usable: QueuedReviewAction[] = [];
    for (const action of valid) {
      if (!isActionTimestampUsable(action, now)) {
        initial.push({ id: action.id, status: "rejected", reason: "Timestamp too old or in the future." });
      } else usable.push(action);
    }

    const appliedResults = await retrySerializable(() => db.$transaction(async (tx) => {
      const [existingLogs, cards] = await Promise.all([
        tx.reviewLog.findMany({
          where: { userId, clientActionId: { in: usable.map((a) => a.id) } },
        }),
        tx.flashcard.findMany({
          where: { userId, id: { in: [...new Set(usable.map((a) => a.flashcardId))] } },
        }),
      ]);
      const existingByAction = new Map(existingLogs.map((log) => [log.clientActionId, log]));
      const cardById = new Map(cards.map((card) => [card.id, card]));
      const changed = new Map<string, Flashcard>();
      const conflictedCards = new Set<string>();
      const logRows: Prisma.ReviewLogCreateManyInput[] = [];
      const results: SyncActionResult[] = [];

      for (const action of usable) {
        const existing = existingByAction.get(action.id);
        if (existing) {
          results.push(existing.flashcardId === action.flashcardId
            ? { id: action.id, status: "duplicate" }
            : { id: action.id, status: "rejected", reason: "Action id was already used for another card." });
          continue;
        }
        const card = cardById.get(action.flashcardId);
        if (!card) {
          results.push({ id: action.id, status: "rejected", reason: "Card not found." });
          continue;
        }
        if (conflictedCards.has(card.id)) {
          results.push({ id: action.id, status: "conflict", reason: "An earlier queued rating for this card is conflicted." });
          continue;
        }
        const reviewedAt = new Date(action.reviewedAt);
        if (card.lastReviewedAt && reviewedAt < card.lastReviewedAt) {
          conflictedCards.add(card.id);
          results.push({
            id: action.id,
            status: "conflict",
            reason: "This card changed after the offline rating. Review it again before discarding the queued action.",
          });
          continue;
        }

        const transition = buildReviewTransition(card, action.rating, reviewedAt);
        logRows.push({
          userId,
          flashcardId: card.id,
          clientActionId: action.id,
          source: "offline",
          rating: action.rating,
          wasCorrect: transition.wasCorrect,
          reviewedAt,
          ...reviewSnapshotData(transition),
        });
        const nextCard = { ...card, ...reviewStateUpdate(transition.after) };
        cardById.set(card.id, nextCard);
        changed.set(card.id, nextCard);
        results.push({ id: action.id, status: "applied" });
      }

      if (logRows.length > 0) await tx.reviewLog.createMany({ data: logRows });
      for (const card of changed.values()) {
        await tx.flashcard.update({ where: { id: card.id }, data: reviewStateUpdate(card) });
      }
      return results;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

    const results = [...initial, ...appliedResults];
    return NextResponse.json({
      applied: results.filter((r) => r.status === "applied").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      rejected: results.filter((r) => r.status === "rejected").length,
      conflicts: results.filter((r) => r.status === "conflict").length,
      results,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

async function retrySerializable<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (e) {
      if (
        attempt < 2 && e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === "P2034" || e.code === "P2002")
      ) continue;
      throw e;
    }
  }
}
