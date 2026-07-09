// Weakness analytics & Mistake Bank aggregation.
//
// Everything here is pure (no database access) so it can be unit-tested;
// lib/learning-data.ts fetches the user-scoped rows and calls these.

import {
  cardAccuracy,
  isMasteredCard,
  isWeakCard,
  type ReviewableCard,
} from "./review";

const DAY_MS = 24 * 60 * 60 * 1000;

export const MISTAKE_WINDOW_DAYS = 14;

/** Card fields the analytics need (structural subset of Flashcard). */
export interface AnalyzableCard extends ReviewableCard {
  text: string;
  kind: string;
  meaning: string;
  example: string | null;
  translation: string | null;
  tags: string;
  category: string | null;
}

/** ReviewLog subset. */
export interface ReviewLogRow {
  flashcardId: string;
  rating: string;
  reviewedAt: Date;
}

/** QuizAnswer subset (already scoped to the user via its session). */
export interface QuizAnswerRow {
  flashcardId: string | null;
  grammarTopicId: string | null;
  questionType: string;
  question: string;
  correctAnswer: string;
  userAnswer: string;
  isCorrect: boolean;
  createdAt: Date;
}

/** GrammarTopic subset. */
export interface TopicRow {
  id: string;
  title: string;
  difficulty: string;
  tags: string;
}

export interface WrongAnswerDetail {
  question: string;
  userAnswer: string;
  correctAnswer: string;
}

export interface VocabMistakeItem {
  type: "vocab";
  id: string; // flashcard id
  title: string; // the word/phrase
  kind: string;
  meaning: string;
  example: string | null;
  translation: string | null;
  tags: string[];
  difficulty: string;
  /** Recent misses: wrong quiz answers + Again/Hard ratings in the window. */
  mistakeCount: number;
  lapses: number;
  /** 0-100, or null when the card has no reviews yet. */
  accuracy: number | null;
  lastMistakeAt: Date | null;
  sources: ("quiz" | "review")[];
  lastWrongAnswer: WrongAnswerDetail | null;
  isRecent: boolean;
  isDifficult: boolean;
  priority: number;
}

export interface GrammarMistakeItem {
  type: "grammar";
  id: string; // grammar topic id
  title: string;
  difficulty: string;
  wrong: number;
  total: number;
  /** 0-100 over all recorded answers for this topic. */
  accuracy: number;
  lastMistakeAt: Date | null;
  lastWrongAnswer: WrongAnswerDetail | null;
  isRecent: boolean;
  priority: number;
}

export type MistakeItem = VocabMistakeItem | GrammarMistakeItem;

export interface AnalyticsOptions {
  now?: Date;
  windowDays?: number;
}

function recencyBoost(lastMistakeAt: Date | null, now: Date): number {
  if (!lastMistakeAt) return 0;
  const days = (now.getTime() - lastMistakeAt.getTime()) / DAY_MS;
  if (days <= 3) return 8;
  if (days <= 7) return 4;
  return 0;
}

/**
 * Builds the vocabulary side of the Mistake Bank. A card qualifies when it
 * was missed recently (wrong quiz answer or Again/Hard rating), or when its
 * long-term record marks it weak. Sorted by priority, worst first.
 */
export function buildVocabMistakes(
  cards: AnalyzableCard[],
  reviewLogs: ReviewLogRow[],
  quizAnswers: QuizAnswerRow[],
  options: AnalyticsOptions = {}
): VocabMistakeItem[] {
  const { now = new Date(), windowDays = MISTAKE_WINDOW_DAYS } = options;
  const since = new Date(now.getTime() - windowDays * DAY_MS);

  // Recent Again/Hard ratings per card (again/hard kept apart: every wrong
  // quiz answer also writes an "again" log, which must not count twice).
  const recentBadLogs = new Map<string, { again: number; hard: number; last: Date }>();
  for (const log of reviewLogs) {
    if (log.reviewedAt < since) continue;
    if (log.rating !== "again" && log.rating !== "hard") continue;
    const entry = recentBadLogs.get(log.flashcardId) ?? { again: 0, hard: 0, last: log.reviewedAt };
    if (log.rating === "again") entry.again++;
    else entry.hard++;
    if (log.reviewedAt > entry.last) entry.last = log.reviewedAt;
    recentBadLogs.set(log.flashcardId, entry);
  }

  // Wrong quiz answers per card (recent count + latest detail, any age).
  const wrongByCard = new Map<string, { recent: number; last: Date; detail: WrongAnswerDetail }>();
  for (const a of quizAnswers) {
    if (!a.flashcardId || a.isCorrect) continue;
    const existing = wrongByCard.get(a.flashcardId);
    const isNewer = !existing || a.createdAt > existing.last;
    wrongByCard.set(a.flashcardId, {
      recent: (existing?.recent ?? 0) + (a.createdAt >= since ? 1 : 0),
      last: isNewer ? a.createdAt : existing.last,
      detail: isNewer
        ? { question: a.question, userAnswer: a.userAnswer, correctAnswer: a.correctAnswer }
        : existing.detail,
    });
  }

  const items: VocabMistakeItem[] = [];
  for (const card of cards) {
    const badLogs = recentBadLogs.get(card.id);
    const wrong = wrongByCard.get(card.id);
    const recentWrong = wrong?.recent ?? 0;
    const againCount = badLogs?.again ?? 0;
    const hardCount = badLogs?.hard ?? 0;
    // Each wrong quiz answer auto-creates one "again" log — count the miss once.
    const reviewOnlyAgain = Math.max(0, againCount - recentWrong);
    const mistakeCount = recentWrong + hardCount + reviewOnlyAgain;

    const qualifies =
      mistakeCount > 0 || isWeakCard(card) || (card.difficulty === "hard" && card.lapses >= 1);
    if (!qualifies) continue;

    const acc = card.reviewCount > 0 ? cardAccuracy(card) : null;
    const lastDates = [badLogs?.last, recentWrong > 0 ? wrong?.last : undefined].filter(
      (d): d is Date => d != null
    );
    const lastMistakeAt = lastDates.length
      ? new Date(Math.max(...lastDates.map((d) => d.getTime())))
      : null;

    const sources: ("quiz" | "review")[] = [];
    if (recentWrong > 0) sources.push("quiz");
    if (hardCount > 0 || reviewOnlyAgain > 0) sources.push("review");

    const isDifficult =
      card.lapses >= 3 ||
      (card.reviewCount >= 4 && (acc ?? 1) < 0.5) ||
      (card.difficulty === "hard" && isWeakCard(card));

    const priority =
      mistakeCount * 6 +
      Math.min(card.lapses, 8) * 4 +
      (card.reviewCount >= 3 ? (1 - (acc ?? 1)) * 15 : 0) +
      (card.difficulty === "hard" ? 5 : 0) +
      recencyBoost(lastMistakeAt, now);

    items.push({
      type: "vocab",
      id: card.id,
      title: card.text,
      kind: card.kind,
      meaning: card.meaning,
      example: card.example,
      translation: card.translation,
      tags: card.tags.split(",").map((t) => t.trim()).filter(Boolean),
      difficulty: card.difficulty,
      mistakeCount,
      lapses: card.lapses,
      accuracy: acc === null ? null : Math.round(acc * 100),
      lastMistakeAt,
      sources,
      lastWrongAnswer: wrong?.detail ?? null,
      isRecent: mistakeCount > 0,
      isDifficult,
      priority: Math.round(priority * 10) / 10,
    });
  }

  return items.sort((a, b) => b.priority - a.priority);
}

/**
 * Builds the grammar side of the Mistake Bank: every saved topic the user
 * has answered wrong at least once, sorted by priority.
 * (Built-in bank questions carry no topic id, so they can't be attributed.)
 */
export function buildGrammarMistakes(
  topics: TopicRow[],
  quizAnswers: QuizAnswerRow[],
  options: AnalyticsOptions = {}
): GrammarMistakeItem[] {
  const { now = new Date(), windowDays = MISTAKE_WINDOW_DAYS } = options;
  const since = new Date(now.getTime() - windowDays * DAY_MS);

  const byTopic = new Map<
    string,
    { wrong: number; total: number; recentWrong: number; last: Date | null; detail: WrongAnswerDetail | null }
  >();
  for (const a of quizAnswers) {
    if (!a.grammarTopicId) continue;
    const s =
      byTopic.get(a.grammarTopicId) ??
      { wrong: 0, total: 0, recentWrong: 0, last: null, detail: null };
    s.total++;
    if (!a.isCorrect) {
      s.wrong++;
      if (a.createdAt >= since) s.recentWrong++;
      if (!s.last || a.createdAt > s.last) {
        s.last = a.createdAt;
        s.detail = { question: a.question, userAnswer: a.userAnswer, correctAnswer: a.correctAnswer };
      }
    }
    byTopic.set(a.grammarTopicId, s);
  }

  const items: GrammarMistakeItem[] = [];
  for (const topic of topics) {
    const s = byTopic.get(topic.id);
    if (!s || s.wrong === 0) continue;
    const wrongRate = s.wrong / s.total;
    items.push({
      type: "grammar",
      id: topic.id,
      title: topic.title,
      difficulty: topic.difficulty,
      wrong: s.wrong,
      total: s.total,
      accuracy: Math.round((1 - wrongRate) * 100),
      lastMistakeAt: s.last,
      lastWrongAnswer: s.detail,
      isRecent: s.recentWrong > 0,
      priority: Math.round((wrongRate * 20 + s.recentWrong * 5 + recencyBoost(s.last, now)) * 10) / 10,
    });
  }

  return items.sort((a, b) => b.priority - a.priority);
}

/** Items failed 2+ times, across vocabulary and grammar, worst first. */
export function mostRepeatedMistakes(
  vocab: VocabMistakeItem[],
  grammar: GrammarMistakeItem[],
  limit = 8
): MistakeItem[] {
  const repeated: { item: MistakeItem; count: number }[] = [
    ...vocab.filter((v) => v.mistakeCount + v.lapses >= 2).map((item) => ({ item, count: item.mistakeCount + item.lapses })),
    ...grammar.filter((g) => g.wrong >= 2).map((item) => ({ item, count: item.wrong })),
  ];
  return repeated
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((r) => r.item);
}

/* ---------------- Weakness analytics ---------------- */

export interface TagWeakness {
  tag: string;
  cards: number;
  reviews: number;
  accuracy: number; // 0-100 across the tag's reviews
  mistakes: number; // recent mistakes across the tag's cards
}

/**
 * Groups performance by tag: accuracy from card counters plus recent
 * mistake counts. Weakest first (most mistakes, then lowest accuracy).
 */
export function weakestTags(
  cards: AnalyzableCard[],
  vocabMistakes: VocabMistakeItem[],
  limit = 6
): TagWeakness[] {
  const mistakesByCard = new Map(vocabMistakes.map((m) => [m.id, m.mistakeCount]));
  const byTag = new Map<string, { cards: number; reviews: number; correct: number; mistakes: number }>();

  for (const card of cards) {
    const tags = card.tags.split(",").map((t) => t.trim()).filter(Boolean);
    for (const tag of tags) {
      const key = tag.toLowerCase();
      const s = byTag.get(key) ?? { cards: 0, reviews: 0, correct: 0, mistakes: 0 };
      s.cards++;
      s.reviews += card.reviewCount;
      s.correct += card.correctCount;
      s.mistakes += mistakesByCard.get(card.id) ?? 0;
      byTag.set(key, s);
    }
  }

  return [...byTag.entries()]
    .filter(([, s]) => s.reviews > 0 || s.mistakes > 0)
    .map(([tag, s]) => ({
      tag,
      cards: s.cards,
      reviews: s.reviews,
      accuracy: s.reviews > 0 ? Math.round((s.correct / s.reviews) * 100) : 0,
      mistakes: s.mistakes,
    }))
    .sort((a, b) => b.mistakes - a.mistakes || a.accuracy - b.accuracy)
    .slice(0, limit);
}

export interface AccuracyBucket {
  label: string;
  correct: number;
  total: number;
  accuracy: number; // 0-100
}

/** Review accuracy grouped by card difficulty (from card counters). */
export function accuracyByDifficulty(cards: AnalyzableCard[]): AccuracyBucket[] {
  const order = ["easy", "medium", "hard"];
  return order.map((difficulty) => {
    const group = cards.filter((c) => c.difficulty === difficulty);
    const total = group.reduce((sum, c) => sum + c.reviewCount, 0);
    const correct = group.reduce((sum, c) => sum + c.correctCount, 0);
    return {
      label: difficulty,
      correct,
      total,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    };
  });
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
  mcq_meaning: "Meaning choice",
  mcq_word: "Reverse choice",
  fill_blank: "Fill in the blank",
  true_false: "True / false",
  mcq: "Grammar choice",
  choose_correct: "Choose correct sentence",
  find_mistake: "Find the mistake",
  correct_sentence: "Correct the sentence",
};

/** Quiz accuracy grouped by question type, most-answered first. */
export function accuracyByQuestionType(quizAnswers: QuizAnswerRow[]): AccuracyBucket[] {
  const byType = new Map<string, { correct: number; total: number }>();
  for (const a of quizAnswers) {
    const s = byType.get(a.questionType) ?? { correct: 0, total: 0 };
    s.total++;
    if (a.isCorrect) s.correct++;
    byType.set(a.questionType, s);
  }
  return [...byType.entries()]
    .map(([type, s]) => ({
      label: QUESTION_TYPE_LABELS[type] ?? type,
      correct: s.correct,
      total: s.total,
      accuracy: Math.round((s.correct / s.total) * 100),
    }))
    .sort((a, b) => b.total - a.total);
}

export interface CardStates {
  mastered: number;
  learning: number;
  weak: number;
  new: number;
}

/** Splits cards into mastered / weak / new / learning (mutually exclusive). */
export function classifyCards(cards: AnalyzableCard[]): CardStates {
  const states: CardStates = { mastered: 0, learning: 0, weak: 0, new: 0 };
  for (const card of cards) {
    if (isMasteredCard(card)) states.mastered++;
    else if (isWeakCard(card)) states.weak++;
    else if (card.reviewCount === 0) states.new++;
    else states.learning++;
  }
  return states;
}

export interface DueBuckets {
  today: number;
  tomorrow: number;
  thisWeek: number; // due within 7 days, after tomorrow
}

/** How many cards come due today / tomorrow / later this week. */
export function dueBuckets(cards: AnalyzableCard[], now: Date = new Date()): DueBuckets {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTomorrow = new Date(endOfToday.getTime() + DAY_MS);
  const endOfWeek = new Date(endOfToday.getTime() + 7 * DAY_MS);

  const buckets: DueBuckets = { today: 0, tomorrow: 0, thisWeek: 0 };
  for (const card of cards) {
    const due = card.dueDate.getTime();
    if (due <= endOfToday.getTime()) buckets.today++;
    else if (due <= endOfTomorrow.getTime()) buckets.tomorrow++;
    else if (due <= endOfWeek.getTime()) buckets.thisWeek++;
  }
  return buckets;
}
