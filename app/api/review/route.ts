import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, str, toErrorResponse } from "@/lib/api-helpers";
import { type Rating } from "@/lib/srs";
import { buildReviewTransition, reviewSnapshotData, reviewStateUpdate } from "@/lib/review-events";

const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

/** Applies one durable, idempotent online review action. */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const flashcardId = str(body.flashcardId, 100);
    const clientActionId = str(body.clientActionId, 100);
    const rating = RATINGS.includes(body.rating as Rating) ? body.rating as Rating : null;
    if (!flashcardId || !clientActionId || !rating) {
      return badRequest("flashcardId, clientActionId and a valid rating are required.");
    }

    const result = await retryTransaction(() => db.$transaction(async (tx) => {
      const existing = await tx.reviewLog.findUnique({
        where: { userId_clientActionId: { userId, clientActionId } },
      });
      if (existing) {
        if (existing.flashcardId !== flashcardId) return null;
        const card = await tx.flashcard.findFirst({ where: { id: flashcardId, userId } });
        return card ? { card, log: existing, duplicate: true } : null;
      }

      const card = await tx.flashcard.findFirst({ where: { id: flashcardId, userId } });
      if (!card) return null;
      const reviewedAt = new Date();
      const transition = buildReviewTransition(card, rating, reviewedAt);
      const log = await tx.reviewLog.create({
        data: {
          userId,
          flashcardId: card.id,
          clientActionId,
          source: "online",
          rating,
          wasCorrect: transition.wasCorrect,
          reviewedAt,
          ...reviewSnapshotData(transition),
        },
      });
      const updated = await tx.flashcard.update({
        where: { id: card.id },
        data: reviewStateUpdate(transition.after),
      });
      return { card: updated, log, duplicate: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

    if (!result) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    return NextResponse.json({
      card: result.card,
      review: {
        reviewLogId: result.log.id,
        intervalDays: result.log.intervalAfter,
        dueDate: result.log.dueDateAfter?.toISOString() ?? result.card.dueDate.toISOString(),
      },
      undo: { reviewLogId: result.log.id },
      duplicate: result.duplicate,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
async function retryTransaction<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (e) {
      if (
        attempt < 2 && e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === "P2034" || e.code === "P2002")
      ) continue;
      throw e;
    }
  }
}
