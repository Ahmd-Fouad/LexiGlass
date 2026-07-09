import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, oneOf, str, toErrorResponse } from "@/lib/api-helpers";
import { buildVocabQuestions, MIN_CARDS_FOR_QUIZ, selectQuizCards } from "@/lib/quiz";
import { buildGrammarQuiz, type TopicStatsMap } from "@/lib/grammar-quiz";
import { getRecentMistakeCounts } from "@/lib/learning-data";
import type { StartQuizResponse, VocabQuizMode } from "@/lib/types";

/**
 * Starts a quiz session and returns its questions.
 * type "vocab": ~20 cards picked by the spaced-repetition priority rules.
 *   Modes: standard | weak (struggling cards) | mistakes (recently wrong) | tag.
 * type "grammar": questions from the user's saved topics + the local bank,
 *   with weak topics (low quiz accuracy) prioritised.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const type = oneOf(body.type, ["vocab", "grammar"] as const, "vocab");

    let questions;
    if (type === "vocab") {
      const mode = oneOf<VocabQuizMode>(body.mode, ["standard", "weak", "mistakes", "tag"], "standard");
      const tag = str(body.tag, 100);
      if (mode === "tag" && !tag) return badRequest("Pick a tag for a tag quiz.");

      const [cards, recentMistakes] = await Promise.all([
        db.flashcard.findMany({ where: { userId } }),
        getRecentMistakeCounts(userId),
      ]);
      if (cards.length < MIN_CARDS_FOR_QUIZ) {
        return badRequest(
          `You need at least ${MIN_CARDS_FOR_QUIZ} cards to start a quiz. Add a few more words first!`
        );
      }

      const selected = selectQuizCards(cards, { mode, tag, recentMistakes });
      if (selected.length === 0) {
        return badRequest(
          mode === "mistakes"
            ? "No recent mistakes to practise — nice work! Take a standard quiz instead."
            : mode === "weak"
              ? "No weak words right now. Take a standard quiz to keep it that way!"
              : `No cards found with the tag “${tag}”.`
        );
      }
      questions = buildVocabQuestions(selected, cards);
    } else {
      const [topics, topicStats] = await Promise.all([
        db.grammarTopic.findMany({ where: { userId } }),
        getTopicStats(userId),
      ]);
      questions = buildGrammarQuiz(topics, { topicStats });
    }

    const session = await db.quizSession.create({
      data: { userId, type, totalQuestions: questions.length },
    });

    const response: StartQuizResponse = { sessionId: session.id, questions };
    return NextResponse.json(response);
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** All-time grammar answer counts per topic (wrong + total). */
async function getTopicStats(userId: string): Promise<TopicStatsMap> {
  const answers = await db.quizAnswer.findMany({
    where: { grammarTopicId: { not: null }, session: { userId } },
    select: { grammarTopicId: true, isCorrect: true },
  });

  const stats: TopicStatsMap = new Map();
  for (const a of answers) {
    if (!a.grammarTopicId) continue;
    const s = stats.get(a.grammarTopicId) ?? { wrong: 0, total: 0 };
    s.total++;
    if (!a.isCorrect) s.wrong++;
    stats.set(a.grammarTopicId, s);
  }
  return stats;
}
