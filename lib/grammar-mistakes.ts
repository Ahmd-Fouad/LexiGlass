// Practice / resolve lifecycle for GrammarMistake records (the per-question
// mistake bank fed by the adaptive AI question pool), plus the pure logic
// used to combine those records with the topic-level QuizAnswer aggregation
// (lib/analytics.ts buildGrammarMistakes) without showing the same underlying
// issue twice in the Mistake Bank.
//
// GrammarMistake rows are never hard-deleted: a correct practice attempt
// moves a row to "practiced"; "Mark resolved" moves it to "resolved". Both
// keep the row for history/analytics.

import { db } from "./db";
import type { GrammarMistakeItem } from "./analytics";

export interface GrammarMistakeRecord {
  id: string;
  grammarTopicId: string | null;
  grammarTopicTitle: string | null;
  generatedQuestionId: string | null;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
  questionType: string;
  choices: string[] | null;
  mistakeCount: number;
  lastMistakeAt: Date;
  status: string; // active | practiced | resolved
  practicedAt: Date | null;
  resolvedAt: Date | null;
}

/** Every GrammarMistake row for the user: active first, most recent first. */
export async function getGrammarMistakeRecords(userId: string): Promise<GrammarMistakeRecord[]> {
  const rows = await db.grammarMistake.findMany({
    where: { userId },
    include: {
      grammarTopic: { select: { title: true } },
      generatedQuestion: { select: { choices: true } },
    },
    orderBy: [{ lastMistakeAt: "desc" }],
  });

  const statusRank: Record<string, number> = { active: 0, practiced: 1, resolved: 2 };

  return rows
    .map((r) => ({
      id: r.id,
      grammarTopicId: r.grammarTopicId,
      grammarTopicTitle: r.grammarTopic?.title ?? null,
      generatedQuestionId: r.generatedQuestionId,
      question: r.question,
      userAnswer: r.userAnswer,
      correctAnswer: r.correctAnswer,
      explanation: r.explanation,
      questionType: r.questionType,
      choices: Array.isArray(r.generatedQuestion?.choices)
        ? (r.generatedQuestion?.choices as string[])
        : null,
      mistakeCount: r.mistakeCount,
      lastMistakeAt: r.lastMistakeAt,
      status: r.status,
      practicedAt: r.practicedAt,
      resolvedAt: r.resolvedAt,
    }))
    .sort((a, b) => (statusRank[a.status] ?? 0) - (statusRank[b.status] ?? 0));
}

/** Topic ids that already have a non-resolved GrammarMistake record. */
export function activeRecordTopicIds(
  records: { grammarTopicId: string | null; status: string }[]
): Set<string> {
  return new Set(
    records
      .filter((r) => r.status !== "resolved" && r.grammarTopicId)
      .map((r) => r.grammarTopicId as string)
  );
}

/**
 * Removes topic-level (QuizAnswer-aggregated) mistake items whose topic
 * already has a more specific, actionable GrammarMistake record — so the
 * same underlying issue isn't shown twice.
 */
export function excludeTopicsCoveredByRecords(
  topicItems: GrammarMistakeItem[],
  recordTopicIds: Set<string>
): GrammarMistakeItem[] {
  return topicItems.filter((item) => !recordTopicIds.has(item.id));
}

function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,!?;:"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pure: loose text comparison used to grade a typed/MCQ practice answer. */
export function isMistakeAnswerCorrect(userAnswer: string, correctAnswer: string): boolean {
  return normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer);
}

export interface MistakePracticeOutcome {
  status: "practiced" | "active";
  mistakeCountDelta: 0 | 1;
}

/** Pure: what a practice attempt does to the record's status/count. */
export function applyMistakePractice(correct: boolean): MistakePracticeOutcome {
  return correct
    ? { status: "practiced", mistakeCountDelta: 0 }
    : { status: "active", mistakeCountDelta: 1 };
}

/**
 * Grades and records a practice attempt. Correct → status "practiced" (kept
 * for history, never deleted); wrong → stays "active", mistakeCount
 * increments and lastMistakeAt refreshes. Scoped to the owner; returns null
 * if the mistake doesn't exist or isn't owned by this user.
 */
export async function practiceGrammarMistake(
  id: string,
  userId: string,
  userProvidedAnswer: string
): Promise<{ status: string; mistakeCount: number; correct: boolean } | null> {
  const existing = await db.grammarMistake.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return null;

  const correct = isMistakeAnswerCorrect(userProvidedAnswer, existing.correctAnswer);
  const outcome = applyMistakePractice(correct);

  const updated = await db.grammarMistake.update({
    where: { id },
    data: correct
      ? { status: outcome.status, practicedAt: new Date() }
      : {
          status: outcome.status,
          mistakeCount: { increment: outcome.mistakeCountDelta },
          lastMistakeAt: new Date(),
        },
  });
  return { status: updated.status, mistakeCount: updated.mistakeCount, correct };
}

/**
 * Marks a mistake resolved. Never deletes the row — history stays for
 * analytics. Scoped to the owner; returns null if not found/owned.
 */
export async function resolveGrammarMistake(
  id: string,
  userId: string
): Promise<{ status: string } | null> {
  const existing = await db.grammarMistake.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return null;

  const updated = await db.grammarMistake.update({
    where: { id },
    data: { status: "resolved", resolvedAt: new Date() },
  });
  return { status: updated.status };
}
