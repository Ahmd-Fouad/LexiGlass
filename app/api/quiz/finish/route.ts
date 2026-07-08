import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, str, toErrorResponse } from "@/lib/api-helpers";

/** Marks a quiz session as finished and stores the final score. */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const sessionId = str(body.sessionId, 100);
    if (!sessionId) return badRequest("sessionId is required.");

    const session = await db.quizSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      return NextResponse.json({ error: "Quiz session not found" }, { status: 404 });
    }

    const correctCount = await db.quizAnswer.count({
      where: { sessionId, isCorrect: true },
    });
    const answered = await db.quizAnswer.count({ where: { sessionId } });

    const updated = await db.quizSession.update({
      where: { id: sessionId },
      data: {
        finishedAt: new Date(),
        correctCount,
        totalQuestions: Math.max(session.totalQuestions, answered),
      },
    });
    return NextResponse.json({ session: updated });
  } catch (e) {
    return toErrorResponse(e);
  }
}
