import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { oneOf, toErrorResponse } from "@/lib/api-helpers";
import { getRecentMistakeCounts } from "@/lib/learning-data";
import {
  PRONUNCIATION_MODES,
  selectPronunciationTargets,
  type PronunciationMode,
} from "@/lib/pronunciation";

/**
 * Returns a set of pronunciation targets (words, phrases or example sentences)
 * from the authenticated user's own cards, chosen by the requested mode.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const mode = oneOf<PronunciationMode>(searchParams.get("mode"), PRONUNCIATION_MODES, "weak");

    const [cards, recentMistakes] = await Promise.all([
      db.flashcard.findMany({ where: { userId } }),
      mode === "mistakes" ? getRecentMistakeCounts(userId) : Promise.resolve(new Map<string, number>()),
    ]);

    const targets = selectPronunciationTargets(cards, mode, { recentMistakes });
    return NextResponse.json({ mode, targets });
  } catch (e) {
    return toErrorResponse(e);
  }
}
