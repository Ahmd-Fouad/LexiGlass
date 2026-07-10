import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { oneOf, toErrorResponse } from "@/lib/api-helpers";
import { getRecentMistakeCounts } from "@/lib/learning-data";
import {
  selectWritingTargets,
  WRITING_MODES,
  type WritingMode,
} from "@/lib/writing-practice";

/**
 * Returns a fresh set of 3–10 target words/phrases for a writing session,
 * chosen from the authenticated user's own cards by the requested mode.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const mode = oneOf<WritingMode>(searchParams.get("mode"), WRITING_MODES, "random");
    const tag = searchParams.get("tag")?.trim() || null;
    const countRaw = Number(searchParams.get("count"));
    const count = Number.isFinite(countRaw) && countRaw > 0 ? countRaw : undefined;

    // Recent-mistake data is only needed for the "mistakes" mode.
    const [cards, recentMistakes] = await Promise.all([
      db.flashcard.findMany({ where: { userId } }),
      mode === "mistakes" ? getRecentMistakeCounts(userId) : Promise.resolve(new Map<string, number>()),
    ]);

    const targets = selectWritingTargets(cards, mode, { count, tag, recentMistakes });
    return NextResponse.json({ mode, targets });
  } catch (e) {
    return toErrorResponse(e);
  }
}
