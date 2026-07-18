import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/api-helpers";
import { getQuestionPoolStats, topUpQuestionPool } from "@/lib/grammar-question-pool";
import { getConfiguredExternalProviders, isAiQuizEnabled } from "@/lib/ai/quiz-generator";
import { enforceRateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

/**
 * Manual "Generate quiz questions" button. Generates a batch for the topic
 * (bypassing the cooldown), validates and saves the valid ones. Never fails
 * the request when a provider fails — the result reports what happened.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const limited = await enforceRateLimit({ req, action: "grammarGenerate", userId });
    if (limited) return limited;
    const { id } = await params;

    const topic = await db.grammarTopic.findFirst({ where: { id, userId } });
    if (!topic) return NextResponse.json({ error: "Topic not found" }, { status: 404 });

    const result = await topUpQuestionPool(userId, id, { force: true, count: 10 });
    const stats = await getQuestionPoolStats(userId, id);

    return NextResponse.json({
      result,
      stats,
      aiEnabled: isAiQuizEnabled(),
      externalProviders: getConfiguredExternalProviders().map((p) => p.name),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
