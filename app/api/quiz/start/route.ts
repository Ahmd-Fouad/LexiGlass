import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, oneOf, str, toErrorResponse } from "@/lib/api-helpers";
import { buildVocabQuestions, MIN_CARDS_FOR_QUIZ, selectQuizCards } from "@/lib/quiz";
import {
  buildGrammarQuiz,
  topicWeakness,
  type GeneratedQuizQuestionInput,
  type TopicStatsMap,
} from "@/lib/grammar-quiz";
import { getRecentMistakeCounts } from "@/lib/learning-data";
import { POOL_LOW_THRESHOLD, topUpQuestionPool } from "@/lib/grammar-question-pool";
import type { StartQuizResponse, VocabQuizMode } from "@/lib/types";

const GENERATED_FETCH_LIMIT = 80;
const MAX_BACKGROUND_TOPUPS = 2;

/**
 * Starts a quiz session and returns its questions.
 * type "vocab": ~20 cards picked by the spaced-repetition priority rules.
 *   Modes: standard | weak (struggling cards) | mistakes (recently wrong) | tag.
 * type "grammar": saved generated questions (adaptive pool) mixed with the
 *   user's topics and the local bank. Generation is never blocking — the quiz
 *   starts from the DB, and a low pool triggers a background top-up.
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
      const [topics, topicStats, generatedRows] = await Promise.all([
        db.grammarTopic.findMany({ where: { userId } }),
        getTopicStats(userId),
        // Active pool questions, least-recently-shown first (never blocks).
        db.generatedGrammarQuestion.findMany({
          where: { userId, status: "active" },
          orderBy: [{ lastShownAt: { sort: "asc", nulls: "first" } }, { timesShown: "asc" }],
          take: GENERATED_FETCH_LIMIT,
        }),
      ]);

      // Weak topics first among generated questions.
      const generatedQuestions: GeneratedQuizQuestionInput[] = generatedRows
        .map((q) => ({
          id: q.id,
          grammarTopicId: q.grammarTopicId,
          questionType: q.questionType,
          question: q.question,
          choices: Array.isArray(q.choices) ? (q.choices as string[]) : null,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
        }))
        .sort(
          (a, b) =>
            topicWeakness(b.grammarTopicId, topicStats) - topicWeakness(a.grammarTopicId, topicStats)
        );

      questions = buildGrammarQuiz(topics, { topicStats, generatedQuestions });

      // Mark the generated questions we actually used as shown, so they rotate.
      const usedGeneratedIds = questions
        .map((q) => q.generatedQuestionId)
        .filter((id): id is string => !!id);
      if (usedGeneratedIds.length > 0) {
        await db.generatedGrammarQuestion.updateMany({
          where: { id: { in: usedGeneratedIds }, userId },
          data: { lastShownAt: new Date(), timesShown: { increment: 1 } },
        });
      }

      // Non-blocking: top up the weakest low pools for next time.
      void triggerBackgroundTopUp(userId, topics, topicStats);
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

/**
 * Fires (does not await) top-ups for the weakest topics whose active pool is
 * low. Cooldown-guarded inside topUpQuestionPool, so this can't spam.
 *
 * Runtime note: this is called with `void` from POST above and must never be
 * awaited there — quiz start has to return from the DB-backed pool
 * immediately regardless of AI provider latency/availability. On serverless
 * hosts (e.g. Vercel) a function can be frozen or torn down right after the
 * response is sent, so this background work is best-effort and may not
 * finish; that's an accepted tradeoff, not a bug — the pool simply gets
 * topped up on a later request instead, and the manual "Generate more
 * questions" button on the grammar edit page never depends on this path.
 */
async function triggerBackgroundTopUp(
  userId: string,
  topics: { id: string }[],
  topicStats: TopicStatsMap
): Promise<void> {
  try {
    const activeCounts = await db.generatedGrammarQuestion.groupBy({
      by: ["grammarTopicId"],
      where: { userId, status: "active" },
      _count: { _all: true },
    });
    const activeByTopic = new Map(activeCounts.map((c) => [c.grammarTopicId, c._count._all]));

    const lowTopics = topics
      .filter((t) => (activeByTopic.get(t.id) ?? 0) < POOL_LOW_THRESHOLD)
      .sort((a, b) => topicWeakness(b.id, topicStats) - topicWeakness(a.id, topicStats))
      .slice(0, MAX_BACKGROUND_TOPUPS);

    for (const topic of lowTopics) {
      await topUpQuestionPool(userId, topic.id, { force: false });
    }
  } catch {
    // Background generation must never affect the quiz.
  }
}
