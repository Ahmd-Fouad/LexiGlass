import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/api-helpers";
import { getQuestionPoolStats } from "@/lib/grammar-question-pool";
import {
  getConfiguredProviders,
  getProviderOrder,
  isAiQuizEnabled,
} from "@/lib/ai/quiz-generator";

type Params = { params: Promise<{ id: string }> };

/** Returns the topic's question-pool stats and AI configuration for the UI. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const topic = await db.grammarTopic.findFirst({ where: { id, userId } });
    if (!topic) return NextResponse.json({ error: "Topic not found" }, { status: 404 });

    const stats = await getQuestionPoolStats(userId, id);
    const providerOrder = getProviderOrder();
    const configuredNames = getConfiguredProviders().map((p) => p.name);
    return NextResponse.json({
      stats,
      aiEnabled: isAiQuizEnabled(),
      externalProviders: configuredNames.filter((n) => n !== "local"),
      providerOrder,
      configuredProviders: configuredNames,
      unconfiguredProviders: providerOrder.filter((n) => n !== "local" && !configuredNames.includes(n)),
      localFallbackAvailable: true,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
