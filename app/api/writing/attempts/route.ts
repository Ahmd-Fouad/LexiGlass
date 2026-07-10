import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, oneOf, strOrEmpty, toErrorResponse } from "@/lib/api-helpers";
import {
  analyzeWritingAttempt,
  cardToWritingTarget,
  MAX_WRITING_TARGETS,
  WRITING_MODES,
  type WritingMode,
} from "@/lib/writing-practice";

const HISTORY_LIMIT = 10;

/** Recent saved writing attempts for the signed-in user (newest first). */
export async function GET() {
  try {
    const userId = await requireUserId();
    const rows = await db.writingAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    });
    return NextResponse.json({ attempts: rows.map(serializeAttempt) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Saves a writing attempt. Targets are re-fetched from the DB scoped to the
 * user (never trusted from the client) and the writing is re-analysed
 * server-side, so the stored feedback/score are authoritative.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));

    const mode = oneOf<WritingMode>(body.mode, WRITING_MODES, "random");
    const text = strOrEmpty(body.text, 5000);
    const ids: string[] = Array.isArray(body.targetIds)
      ? body.targetIds.filter((id: unknown): id is string => typeof id === "string").slice(0, MAX_WRITING_TARGETS)
      : [];

    if (!text.trim()) return badRequest("Write something before saving.");
    if (ids.length === 0) return badRequest("No target words to check against.");

    // Ownership-safe: only the user's own cards, only among the requested ids.
    const cards = await db.flashcard.findMany({ where: { id: { in: ids }, userId } });
    if (cards.length === 0) return badRequest("Those target words were not found.");

    // Preserve the order the client used for display.
    const byId = new Map(cards.map((c) => [c.id, c]));
    const targets = ids
      .map((id) => byId.get(id))
      .filter((c): c is (typeof cards)[number] => Boolean(c))
      .map(cardToWritingTarget);

    const feedback = analyzeWritingAttempt(text, targets);

    const attempt = await db.writingAttempt.create({
      data: {
        userId,
        mode,
        promptWords: targets as unknown as Prisma.InputJsonValue,
        text,
        feedback: feedback as unknown as Prisma.InputJsonValue,
        score: feedback.score,
      },
    });

    return NextResponse.json({ attempt: serializeAttempt(attempt) }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** JSON-safe shape for the client (dates as ISO strings). */
function serializeAttempt(a: {
  id: string;
  mode: string;
  promptWords: Prisma.JsonValue;
  feedback: Prisma.JsonValue;
  score: number;
  createdAt: Date;
}) {
  return {
    id: a.id,
    mode: a.mode,
    promptWords: a.promptWords,
    feedback: a.feedback,
    score: a.score,
    createdAt: a.createdAt.toISOString(),
  };
}
