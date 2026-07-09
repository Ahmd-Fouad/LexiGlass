import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/api-helpers";
import {
  getQuestionPoolStats,
  shouldTopUpQuestionPool,
  topUpQuestionPool,
} from "@/lib/grammar-question-pool";

type Params = { params: Promise<{ id: string }> };

/**
 * Tops up the question pool only when it's low (respects the generation
 * cooldown). Safe to call opportunistically from the client.
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const topic = await db.grammarTopic.findFirst({ where: { id, userId } });
    if (!topic) return NextResponse.json({ error: "Topic not found" }, { status: 404 });

    const stats = await getQuestionPoolStats(userId, id);
    if (!shouldTopUpQuestionPool(stats)) {
      return NextResponse.json({
        result: {
          status: "skipped",
          reason: "pool sufficient",
          provider: null,
          generated: 0,
          valid: 0,
          saved: 0,
          rejected: 0,
        },
        stats,
      });
    }

    const result = await topUpQuestionPool(userId, id, { force: false });
    const updated = await getQuestionPoolStats(userId, id);
    return NextResponse.json({ result, stats: updated });
  } catch (e) {
    return toErrorResponse(e);
  }
}
