// The grammar question pool: the DB-facing lifecycle around
// GeneratedGrammarQuestion. Reads active questions for quizzes, retires
// correctly-answered ones, records wrong ones as GrammarMistakes, and tops up
// the pool via the AI orchestrator when it runs low.
//
// Correctly-answered questions are never hard-deleted — they move to
// "mastered" (preserving history). Wrong ones stay available for Mistake Bank
// but are deprioritised in the normal quiz.

import type { GeneratedGrammarQuestion, GrammarTopic } from "@prisma/client";
import { db } from "./db";
import {
  generateWithFallback,
  prepareGeneratedQuestions,
  saveGeneratedQuestions,
  sourceHashForTopic,
} from "./ai/quiz-generator";
import type { GrammarTopicForPrompt } from "./ai/providers/types";

/** Target number of active questions to keep per topic. */
export const POOL_TARGET = 20;
/** Below this many active questions, the pool is "low" and should top up. */
export const POOL_LOW_THRESHOLD = 10;
/** Correct answers needed before a question is retired as "mastered". */
export const RETIRE_AFTER_CORRECT = 2;
/** Minimum gap between generation runs for one topic (unless forced). */
export const GENERATION_COOLDOWN_MS = 2 * 60 * 1000;

export interface QuestionPoolStats {
  active: number;
  retired: number; // retired + mastered
  mastered: number;
  rejected: number;
  draft: number;
  wrong: number; // active GrammarMistake rows for this topic
  total: number; // non-rejected generated questions
  providers: string[];
  sourceCoverage: { ai: number; local: number };
  lastGeneratedAt: Date | null;
  lastGenerationProvider: string | null;
  lastGenerationStatus: string | null; // "success" | "failed" | "skipped"
}

/** Pure: is the active pool low enough to warrant a top-up? */
export function shouldTopUpQuestionPool(stats: { active: number }): boolean {
  return stats.active < POOL_LOW_THRESHOLD;
}

function toPromptTopic(topic: GrammarTopic): GrammarTopicForPrompt {
  return {
    title: topic.title,
    explanation: topic.explanation,
    examples: topic.examples,
    commonMistakes: topic.commonMistakes,
    notes: topic.notes,
    tags: topic.tags,
    difficulty: topic.difficulty,
  };
}

/**
 * Returns active questions for a quiz, preferring ones not shown recently and
 * mixing question types. Assumes ownership already verified (still scoped).
 */
export async function getActiveQuestionsForTopic(
  userId: string,
  topicId: string,
  limit = POOL_TARGET
): Promise<GeneratedGrammarQuestion[]> {
  const rows = await db.generatedGrammarQuestion.findMany({
    where: { userId, grammarTopicId: topicId, status: "active" },
    orderBy: [{ lastShownAt: { sort: "asc", nulls: "first" } }, { timesShown: "asc" }],
    take: Math.max(limit * 2, limit), // over-fetch, then balance types
  });

  // Balance question types round-robin so a quiz isn't all one shape.
  const byType = new Map<string, GeneratedGrammarQuestion[]>();
  for (const q of rows) {
    const list = byType.get(q.questionType) ?? [];
    list.push(q);
    byType.set(q.questionType, list);
  }
  const buckets = [...byType.values()];
  const balanced: GeneratedGrammarQuestion[] = [];
  let idx = 0;
  while (balanced.length < Math.min(limit, rows.length)) {
    const bucket = buckets[idx % buckets.length];
    const next = bucket.shift();
    if (next) balanced.push(next);
    idx++;
    if (buckets.every((b) => b.length === 0)) break;
  }
  return balanced.slice(0, limit);
}

/** Aggregated pool stats for the topic's question-pool UI. */
export async function getQuestionPoolStats(
  userId: string,
  topicId: string
): Promise<QuestionPoolStats> {
  const [grouped, questions, wrong, lastLog] = await Promise.all([
    db.generatedGrammarQuestion.groupBy({
      by: ["status"],
      where: { userId, grammarTopicId: topicId },
      _count: { _all: true },
    }),
    db.generatedGrammarQuestion.findMany({
      where: { userId, grammarTopicId: topicId, status: { not: "rejected" } },
      select: { provider: true, source: true, createdAt: true },
    }),
    db.grammarMistake.count({
      where: { userId, grammarTopicId: topicId, status: "active" },
    }),
    db.aIGenerationLog.findFirst({
      where: { userId, grammarTopicId: topicId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, provider: true, status: true },
    }),
  ]);

  const count = (status: string) =>
    grouped.find((g) => g.status === status)?._count._all ?? 0;

  const providers = [...new Set(questions.map((q) => q.provider))];
  const sourceCoverage = {
    ai: questions.filter((q) => q.source !== "local").length,
    local: questions.filter((q) => q.source === "local").length,
  };
  const lastGeneratedAt =
    lastLog?.createdAt ??
    questions.reduce<Date | null>((max, q) => (!max || q.createdAt > max ? q.createdAt : max), null);

  return {
    active: count("active"),
    mastered: count("mastered"),
    retired: count("retired") + count("mastered"),
    rejected: count("rejected"),
    draft: count("draft") + count("approved"),
    wrong,
    total: questions.length,
    providers,
    sourceCoverage,
    lastGeneratedAt,
    lastGenerationProvider: lastLog?.provider ?? null,
    lastGenerationStatus: lastLog?.status ?? null,
  };
}

/**
 * Records a correct answer to a generated question. Increments counters and,
 * once answered correctly enough times, retires it as "mastered" (never
 * hard-deleted). Scoped to the owner.
 */
export async function retireCorrectQuestion(
  questionId: string,
  userId: string
): Promise<{ status: string } | null> {
  const q = await db.generatedGrammarQuestion.findUnique({ where: { id: questionId } });
  if (!q || q.userId !== userId) return null;

  const willMaster = q.timesCorrect + 1 >= RETIRE_AFTER_CORRECT;
  const updated = await db.generatedGrammarQuestion.update({
    where: { id: q.id },
    data: {
      timesCorrect: { increment: 1 },
      timesShown: { increment: 1 },
      lastAnsweredAt: new Date(),
      lastShownAt: new Date(),
      ...(willMaster ? { status: "mastered", retiredAt: new Date() } : {}),
    },
  });
  return { status: updated.status };
}

export interface RecordWrongInput {
  userId: string;
  /** Must already be verified to belong to userId (or null) — it's stored on
   * the GrammarMistake row and joined back into the Mistake Bank UI. */
  grammarTopicId: string | null;
  generatedQuestionId?: string | null;
  quizSessionId?: string | null;
  quizAnswerId?: string | null;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  explanation?: string;
  questionType?: string;
}

/**
 * Records a wrong grammar answer: bumps the generated question's counters
 * (kept active but deprioritised via lastShownAt) and upserts a GrammarMistake
 * for Mistake Bank. Repeated failures increment mistakeCount.
 */
export async function recordWrongGrammarQuestion(
  input: RecordWrongInput
): Promise<{ mistakeId: string; mistakeCount: number }> {
  // Bump the generated question, if this wrong answer came from one. The
  // reference is only kept when the caller owns that question — GrammarMistake
  // rows join its choices back into the Mistake Bank UI.
  let generatedQuestionId = input.generatedQuestionId ?? null;
  if (generatedQuestionId) {
    const q = await db.generatedGrammarQuestion.findUnique({
      where: { id: generatedQuestionId },
    });
    if (q && q.userId === input.userId) {
      await db.generatedGrammarQuestion.update({
        where: { id: q.id },
        data: {
          timesWrong: { increment: 1 },
          timesShown: { increment: 1 },
          lastAnsweredAt: new Date(),
          lastShownAt: new Date(), // deprioritise in normal quiz
        },
      });
    } else {
      generatedQuestionId = null;
    }
  }

  // Upsert the GrammarMistake (no natural unique key → find-then-write).
  const existing = await db.grammarMistake.findFirst({
    where: {
      userId: input.userId,
      status: { not: "resolved" },
      ...(generatedQuestionId
        ? { generatedQuestionId }
        : { grammarTopicId: input.grammarTopicId, question: input.question }),
    },
  });

  if (existing) {
    const updated = await db.grammarMistake.update({
      where: { id: existing.id },
      data: {
        mistakeCount: { increment: 1 },
        lastMistakeAt: new Date(),
        userAnswer: input.userAnswer,
        correctAnswer: input.correctAnswer,
        status: "active",
        quizSessionId: input.quizSessionId ?? existing.quizSessionId,
        quizAnswerId: input.quizAnswerId ?? existing.quizAnswerId,
      },
    });
    return { mistakeId: updated.id, mistakeCount: updated.mistakeCount };
  }

  const created = await db.grammarMistake.create({
    data: {
      userId: input.userId,
      grammarTopicId: input.grammarTopicId,
      generatedQuestionId,
      quizSessionId: input.quizSessionId ?? null,
      quizAnswerId: input.quizAnswerId ?? null,
      question: input.question,
      userAnswer: input.userAnswer,
      correctAnswer: input.correctAnswer,
      explanation: input.explanation ?? "",
      questionType: input.questionType ?? "",
    },
  });
  return { mistakeId: created.id, mistakeCount: created.mistakeCount };
}

export interface TopUpResult {
  status: "success" | "skipped" | "failed";
  reason?: string;
  provider: string | null;
  generated: number;
  valid: number;
  saved: number;
  rejected: number;
}

/**
 * Generates more questions for a topic and saves the valid ones. Guarded by a
 * per-topic cooldown (unless force). Writes an AIGenerationLog. Never throws.
 */
export async function topUpQuestionPool(
  userId: string,
  topicId: string,
  options: { force?: boolean; count?: number } = {}
): Promise<TopUpResult> {
  const { force = false, count = 10 } = options;

  const topic = await db.grammarTopic.findFirst({ where: { id: topicId, userId } });
  if (!topic) {
    return { status: "failed", reason: "topic not found", provider: null, generated: 0, valid: 0, saved: 0, rejected: 0 };
  }

  // Cooldown guard. Deliberately NOT logged to AIGenerationLog: this check runs
  // on every quiz start / wrong-answer event when the pool is low (see
  // triggerBackgroundTopUp in app/api/quiz/start and activateReplacementQuestion
  // below), so logging every skip would itself satisfy the "recent log" lookup
  // below and could keep pushing the cooldown window forward indefinitely,
  // starving real generation. The manual "Generate more questions" button
  // (force:true) bypasses this guard entirely, so it's never blocked by it.
  if (!force) {
    const recent = await db.aIGenerationLog.findFirst({
      where: { userId, grammarTopicId: topicId, createdAt: { gte: new Date(Date.now() - GENERATION_COOLDOWN_MS) } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (recent) {
      return { status: "skipped", reason: "cooldown", provider: null, generated: 0, valid: 0, saved: 0, rejected: 0 };
    }
  }

  const promptTopic = toPromptTopic(topic);
  const sourceHash = sourceHashForTopic(promptTopic);

  let result: TopUpResult;
  try {
    const generation = await generateWithFallback(promptTopic, count);
    const existing = await db.generatedGrammarQuestion.findMany({
      where: { grammarTopicId: topicId, status: { not: "rejected" } },
      select: { question: true },
    });
    const prepared = prepareGeneratedQuestions(generation.drafts, { existing, topic: promptTopic });
    const saved =
      generation.provider && prepared.valid.length > 0
        ? await saveGeneratedQuestions(userId, topicId, prepared.valid, {
            provider: generation.provider,
            model: generation.model,
            sourceHash,
          })
        : 0;

    result = {
      status: saved > 0 ? "success" : "failed",
      reason: saved > 0 ? undefined : generation.drafts.length === 0 ? "no questions generated" : "no new valid questions",
      provider: generation.provider,
      generated: generation.drafts.length,
      valid: prepared.valid.length,
      saved,
      rejected: prepared.rejected,
    };

    await db.aIGenerationLog.create({
      data: {
        userId,
        grammarTopicId: topicId,
        provider: generation.provider ?? "none",
        model: generation.model,
        status: saved > 0 ? "success" : "failed",
        errorMessage: result.reason,
        generatedCount: generation.drafts.length,
        validCount: prepared.valid.length,
        rejectedCount: prepared.rejected,
      },
    });
  } catch (e) {
    result = {
      status: "failed",
      reason: e instanceof Error ? e.message : "generation failed",
      provider: null,
      generated: 0,
      valid: 0,
      saved: 0,
      rejected: 0,
    };
    await db.aIGenerationLog.create({
      data: {
        userId,
        grammarTopicId: topicId,
        provider: "none",
        status: "failed",
        errorMessage: result.reason,
      },
    }).catch(() => {});
  }

  return result;
}

/**
 * Ensures the pool has enough active questions after a question leaves it
 * (answered correctly/wrong). Triggers a top-up when low. Safe to fire and
 * forget from an answer handler — callers must `void` this and `.catch(() =>
 * {})` it (see app/api/quiz/answer/route.ts) so a slow/failing provider call
 * never delays or fails the answer response. On serverless hosts the request
 * may finish and freeze the function before this background call resolves;
 * that's fine because it's opportunistic — the pool is re-checked (and
 * topped up again if still low) on the next quiz start or wrong answer, and
 * the "Generate more questions" button in the grammar edit UI always works
 * as a manual, synchronous fallback regardless of background execution.
 */
export async function activateReplacementQuestion(
  userId: string,
  topicId: string
): Promise<{ triggered: boolean; saved: number }> {
  const activeCount = await db.generatedGrammarQuestion.count({
    where: { userId, grammarTopicId: topicId, status: "active" },
  });
  if (activeCount >= POOL_TARGET) return { triggered: false, saved: 0 };

  const result = await topUpQuestionPool(userId, topicId, { force: false });
  return { triggered: result.status !== "skipped", saved: result.saved };
}
