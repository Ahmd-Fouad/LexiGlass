import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, str, toErrorResponse } from "@/lib/api-helpers";
import { MAX_INTERVAL_DAYS } from "@/lib/srs";

/**
 * Undoes the most recent rating of a flashcard: restores the pre-rating SRS
 * state (returned by POST /api/review) and deletes the ReviewLog entry.
 * Only the latest log of a card can be undone, and only by its owner.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));

    const reviewLogId = str(body.reviewLogId, 100);
    const previous = body.previous as
      | { easeFactor?: unknown; intervalDays?: unknown; dueDate?: unknown; lastReviewedAt?: unknown }
      | undefined;
    if (!reviewLogId || !previous) return badRequest("reviewLogId and previous state are required.");

    const easeFactor = Number(previous.easeFactor);
    const intervalDays = Number(previous.intervalDays);
    const dueDate = new Date(String(previous.dueDate));
    const lastReviewedAt =
      previous.lastReviewedAt == null ? null : new Date(String(previous.lastReviewedAt));

    // The snapshot only restores the user's own card, but still reject
    // values the SRS could never have produced.
    if (
      !Number.isFinite(easeFactor) || easeFactor < 1 || easeFactor > 3.5 ||
      !Number.isFinite(intervalDays) || intervalDays < 0 || intervalDays > MAX_INTERVAL_DAYS ||
      Number.isNaN(dueDate.getTime()) ||
      (lastReviewedAt !== null && Number.isNaN(lastReviewedAt.getTime()))
    ) {
      return badRequest("Invalid previous state.");
    }

    const log = await db.reviewLog.findUnique({
      where: { id: reviewLogId },
      include: { flashcard: true },
    });
    if (!log || log.userId !== userId || log.flashcard.userId !== userId) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    const latest = await db.reviewLog.findFirst({
      where: { flashcardId: log.flashcardId },
      orderBy: { reviewedAt: "desc" },
      select: { id: true },
    });
    if (latest?.id !== log.id) {
      return badRequest("Only the most recent review of a card can be undone.");
    }

    const card = log.flashcard;
    const [updated] = await db.$transaction([
      db.flashcard.update({
        where: { id: card.id },
        data: {
          easeFactor,
          intervalDays,
          dueDate,
          lastReviewedAt,
          reviewCount: Math.max(0, card.reviewCount - 1),
          correctCount: Math.max(0, card.correctCount - (log.wasCorrect ? 1 : 0)),
          incorrectCount: Math.max(0, card.incorrectCount - (log.wasCorrect ? 0 : 1)),
          lapses: Math.max(0, card.lapses - (log.rating === "again" ? 1 : 0)),
        },
      }),
      db.reviewLog.delete({ where: { id: log.id } }),
    ]);

    return NextResponse.json({ card: updated });
  } catch (e) {
    return toErrorResponse(e);
  }
}
