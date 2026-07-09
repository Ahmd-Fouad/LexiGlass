// Server-side fetchers for the learning data used by the Mistake Bank,
// Smart Daily Study Plan and Weakness Analytics.
//
// Every query here is scoped to the given userId (QuizAnswer via its
// session). The heavy lifting lives in the pure modules lib/analytics.ts
// and lib/study-plan.ts, which this file feeds.

import { db } from "./db";
import {
  buildGrammarMistakes,
  buildVocabMistakes,
  MISTAKE_WINDOW_DAYS,
  type GrammarMistakeItem,
  type QuizAnswerRow,
  type VocabMistakeItem,
} from "./analytics";
import { isWeakCard, type RecentMistakeCounts } from "./review";
import { buildDailyPlanItems, type DailyPlanSnapshot, type PlanItem } from "./study-plan";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Wrong quiz answers + "Again" ratings in the recent window, counted per
 * card. Used for review/quiz card selection and the daily plan.
 */
export async function getRecentMistakeCounts(
  userId: string,
  windowDays = MISTAKE_WINDOW_DAYS
): Promise<RecentMistakeCounts> {
  const since = new Date(Date.now() - windowDays * DAY_MS);
  const [wrongAnswers, againLogs] = await Promise.all([
    db.quizAnswer.findMany({
      where: {
        isCorrect: false,
        createdAt: { gte: since },
        flashcardId: { not: null },
        session: { userId },
      },
      select: { flashcardId: true },
    }),
    db.reviewLog.findMany({
      where: { userId, rating: "again", reviewedAt: { gte: since } },
      select: { flashcardId: true },
    }),
  ]);

  // Each wrong quiz answer auto-creates one "again" log, so a quiz miss must
  // not count twice: total = wrong answers + review-only "again" ratings.
  const wrongCounts = new Map<string, number>();
  for (const { flashcardId } of wrongAnswers) {
    if (!flashcardId) continue;
    wrongCounts.set(flashcardId, (wrongCounts.get(flashcardId) ?? 0) + 1);
  }
  const againCounts = new Map<string, number>();
  for (const { flashcardId } of againLogs) {
    againCounts.set(flashcardId, (againCounts.get(flashcardId) ?? 0) + 1);
  }

  const counts: RecentMistakeCounts = new Map();
  for (const id of new Set([...wrongCounts.keys(), ...againCounts.keys()])) {
    const wrong = wrongCounts.get(id) ?? 0;
    const again = againCounts.get(id) ?? 0;
    counts.set(id, wrong + Math.max(0, again - wrong));
  }
  return counts;
}

export interface MistakeBankData {
  vocab: VocabMistakeItem[];
  grammar: GrammarMistakeItem[];
}

/** Everything the Mistake Bank page needs, worst items first. */
export async function getMistakeBank(userId: string): Promise<MistakeBankData> {
  const since = new Date(Date.now() - MISTAKE_WINDOW_DAYS * DAY_MS);

  const [cards, topics, recentBadLogs, quizAnswers] = await Promise.all([
    db.flashcard.findMany({ where: { userId } }),
    db.grammarTopic.findMany({
      where: { userId },
      select: { id: true, title: true, difficulty: true, tags: true },
    }),
    db.reviewLog.findMany({
      where: { userId, reviewedAt: { gte: since }, rating: { in: ["again", "hard"] } },
      select: { flashcardId: true, rating: true, reviewedAt: true },
    }),
    // Wrong vocab answers (any age, for "last wrong answer" details) plus all
    // grammar answers (accuracy needs correct ones too). Capped for safety.
    db.quizAnswer.findMany({
      where: {
        session: { userId },
        OR: [
          { isCorrect: false, flashcardId: { not: null } },
          { grammarTopicId: { not: null } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        flashcardId: true,
        grammarTopicId: true,
        questionType: true,
        question: true,
        correctAnswer: true,
        userAnswer: true,
        isCorrect: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    vocab: buildVocabMistakes(cards, recentBadLogs, quizAnswers, {}),
    grammar: buildGrammarMistakes(topics, quizAnswers, {}),
  };
}

export interface WeaknessData {
  cards: Awaited<ReturnType<typeof db.flashcard.findMany>>;
  vocabMistakes: VocabMistakeItem[];
  grammarMistakes: GrammarMistakeItem[];
  quizAnswers: QuizAnswerRow[];
}

/** Data for the stats page's weakness sections (cards + mistakes + answers). */
export async function getWeaknessData(userId: string): Promise<WeaknessData> {
  const [bank, cards, quizAnswers] = await Promise.all([
    getMistakeBank(userId),
    db.flashcard.findMany({ where: { userId } }),
    db.quizAnswer.findMany({
      where: { session: { userId } },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: {
        flashcardId: true,
        grammarTopicId: true,
        questionType: true,
        question: true,
        correctAnswer: true,
        userAnswer: true,
        isCorrect: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    cards,
    vocabMistakes: bank.vocab,
    grammarMistakes: bank.grammar,
    quizAnswers,
  };
}

/** Weakest saved grammar topic by quiz history (needs a few answers to judge). */
async function getWeakestGrammarTopic(
  userId: string
): Promise<{ id: string; title: string } | null> {
  const answers = await db.quizAnswer.findMany({
    where: { grammarTopicId: { not: null }, session: { userId } },
    select: { grammarTopicId: true, isCorrect: true },
  });

  const byTopic = new Map<string, { wrong: number; total: number }>();
  for (const a of answers) {
    if (!a.grammarTopicId) continue;
    const s = byTopic.get(a.grammarTopicId) ?? { wrong: 0, total: 0 };
    s.total++;
    if (!a.isCorrect) s.wrong++;
    byTopic.set(a.grammarTopicId, s);
  }

  let weakestId: string | null = null;
  let weakestRate = 0.3; // only flag a topic when at least ~1 in 3 answers is wrong
  for (const [topicId, s] of byTopic) {
    if (s.total < 3) continue;
    const rate = s.wrong / s.total;
    if (rate > weakestRate) {
      weakestRate = rate;
      weakestId = topicId;
    }
  }
  if (!weakestId) return null;

  const topic = await db.grammarTopic.findFirst({
    where: { id: weakestId, userId },
    select: { id: true, title: true },
  });
  return topic;
}

/** Assembles today's snapshot and builds the Smart Daily Study Plan. */
export async function buildDailyStudyPlan(userId: string): Promise<PlanItem[]> {
  const todayStart = startOfToday();
  const now = new Date();

  const [cards, grammarTopicCount, recentMistakes, logsToday, sessionsToday, weakestGrammarTopic] =
    await Promise.all([
      db.flashcard.findMany({ where: { userId } }),
      db.grammarTopic.count({ where: { userId } }),
      getRecentMistakeCounts(userId),
      db.reviewLog.findMany({
        where: { userId, reviewedAt: { gte: todayStart } },
        select: { flashcardId: true },
      }),
      db.quizSession.findMany({
        where: { userId, startedAt: { gte: todayStart } },
        select: { type: true, finishedAt: true },
      }),
      getWeakestGrammarTopic(userId),
    ]);

  const reviewedTodayIds = new Set(logsToday.map((l) => l.flashcardId));
  const weakCards = cards.filter(isWeakCard);
  const mistakeCardIds = [...recentMistakes.keys()].filter((id) =>
    cards.some((c) => c.id === id)
  );

  const snapshot: DailyPlanSnapshot = {
    totalCards: cards.length,
    grammarTopicCount,
    dueCount: cards.filter((c) => c.dueDate.getTime() <= now.getTime()).length,
    weakCount: weakCards.length,
    recentMistakeCardCount: mistakeCardIds.length,
    mistakeCardsReviewedToday: mistakeCardIds.filter((id) => reviewedTodayIds.has(id)).length,
    weakCardsReviewedToday: weakCards.filter((c) => reviewedTodayIds.has(c.id)).length,
    reviewsToday: logsToday.length,
    startedVocabQuizToday: sessionsToday.some((s) => s.type === "vocab"),
    finishedVocabQuizToday: sessionsToday.some((s) => s.type === "vocab" && s.finishedAt != null),
    startedGrammarQuizToday: sessionsToday.some((s) => s.type === "grammar"),
    finishedGrammarQuizToday: sessionsToday.some(
      (s) => s.type === "grammar" && s.finishedAt != null
    ),
    weakestGrammarTopic,
  };

  return buildDailyPlanItems(snapshot);
}
