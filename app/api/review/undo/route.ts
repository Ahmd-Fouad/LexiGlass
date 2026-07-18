import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, readJsonBody, str, toErrorResponse } from "@/lib/api-helpers";

/** Restores the latest review from the server-stored authoritative snapshot. */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const parsed = await readJsonBody(req, 2 * 1024);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const reviewLogId = str(body.reviewLogId, 100);
    if (!reviewLogId) return badRequest("reviewLogId is required.");

    const result = await retrySerializable(() => db.$transaction(async (tx) => {
      const log = await tx.reviewLog.findFirst({
        where: { id: reviewLogId, userId },
        include: { flashcard: true },
      });
      if (!log) return { status: "missing" as const };
      if (log.revertedAt) return { status: "reverted" as const };

      const latest = await tx.reviewLog.findFirst({
        where: { userId, flashcardId: log.flashcardId, revertedAt: null },
        orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      if (latest?.id !== log.id) return { status: "newer" as const };

      if (
        log.easeFactorBefore == null || log.dueDateBefore == null ||
        log.reviewCountBefore == null || log.correctCountBefore == null ||
        log.incorrectCountBefore == null || log.lapsesBefore == null
      ) return { status: "legacy" as const };

      const updated = await tx.flashcard.update({
        where: { id: log.flashcardId },
        data: {
          easeFactor: log.easeFactorBefore,
          intervalDays: log.intervalBefore,
          dueDate: log.dueDateBefore,
          reviewCount: log.reviewCountBefore,
          correctCount: log.correctCountBefore,
          incorrectCount: log.incorrectCountBefore,
          lapses: log.lapsesBefore,
          lastReviewedAt: log.lastReviewedAtBefore,
        },
      });
      await tx.reviewLog.update({ where: { id: log.id }, data: { revertedAt: new Date() } });
      return { status: "ok" as const, card: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

    if (result.status === "missing") return NextResponse.json({ error: "Review not found" }, { status: 404 });
    if (result.status === "reverted") return NextResponse.json({ error: "Review was already undone" }, { status: 409 });
    if (result.status === "newer") return NextResponse.json({ error: "A newer review must be undone first" }, { status: 409 });
    if (result.status === "legacy") return NextResponse.json({ error: "This older review has no undo snapshot" }, { status: 409 });
    return NextResponse.json({ card: result.card });
  } catch (e) {
    return toErrorResponse(e);
  }
}
async function retrySerializable<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (e) {
      if (attempt < 2 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") continue;
      throw e;
    }
  }
}
