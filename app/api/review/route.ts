import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, oneOf, str, toErrorResponse } from "@/lib/api-helpers";
import { applyRating, ratingWasCorrect, type Rating } from "@/lib/srs";

/**
 * Applies an SRS rating (again/hard/good/easy) to a flashcard,
 * updates its schedule and writes a ReviewLog entry.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));

    const flashcardId = str(body.flashcardId, 100);
    const rating = oneOf<Rating>(body.rating, ["again", "hard", "good", "easy"], "good");
    if (!flashcardId) return badRequest("flashcardId is required.");

    const card = await db.flashcard.findUnique({ where: { id: flashcardId } });
    if (!card || card.userId !== userId) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const next = applyRating(card, rating);
    const wasCorrect = ratingWasCorrect(rating);

    const [updated, log] = await db.$transaction([
      db.flashcard.update({
        where: { id: card.id },
        data: {
          easeFactor: next.easeFactor,
          intervalDays: next.intervalDays,
          dueDate: next.dueDate,
          reviewCount: { increment: 1 },
          correctCount: { increment: wasCorrect ? 1 : 0 },
          incorrectCount: { increment: wasCorrect ? 0 : 1 },
          lapses: { increment: rating === "again" ? 1 : 0 },
          lastReviewedAt: new Date(),
        },
      }),
      db.reviewLog.create({
        data: {
          userId,
          flashcardId: card.id,
          rating,
          wasCorrect,
          intervalBefore: card.intervalDays,
          intervalAfter: next.intervalDays,
        },
      }),
    ]);

    // The pre-rating SRS state lets the client offer "Undo last rating"
    // (see /api/review/undo). Only ever applies to the user's own card.
    return NextResponse.json({
      card: updated,
      undo: {
        reviewLogId: log.id,
        previous: {
          easeFactor: card.easeFactor,
          intervalDays: card.intervalDays,
          dueDate: card.dueDate.toISOString(),
          lastReviewedAt: card.lastReviewedAt?.toISOString() ?? null,
        },
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
