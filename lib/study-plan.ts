// Smart Daily Study Plan: turns today's learning data into a short list of
// concrete tasks ("Review 12 due cards", "Repair 4 recent mistakes", …).
//
// Pure logic (no database access) so it can be unit-tested;
// lib/learning-data.ts assembles the snapshot and calls buildDailyPlanItems.

export type PlanStatus = "not_started" | "in_progress" | "completed";
export type PlanPriority = "high" | "medium" | "low";

export interface PlanItem {
  id: string;
  title: string;
  reason: string;
  /** Rough estimate shown to the user. */
  minutes: number;
  /** How many cards/questions the task covers (0 when not countable). */
  count: number;
  priority: PlanPriority;
  status: PlanStatus;
  href: string;
  cta: string;
}

/** Everything the plan needs to know about today, already user-scoped. */
export interface DailyPlanSnapshot {
  totalCards: number;
  grammarTopicCount: number;
  dueCount: number;
  weakCount: number;
  /** Distinct cards missed in the recent window (wrong quiz answer or Again rating). */
  recentMistakeCardCount: number;
  /** Of those, how many were already reviewed today. */
  mistakeCardsReviewedToday: number;
  weakCardsReviewedToday: number;
  reviewsToday: number;
  startedVocabQuizToday: boolean;
  finishedVocabQuizToday: boolean;
  startedGrammarQuizToday: boolean;
  finishedGrammarQuizToday: boolean;
  weakestGrammarTopic: { id: string; title: string } | null;
  /** WritingAttempt rows saved today (0 when the user hasn't written yet). */
  writingAttemptsToday: number;
}

const MIN_CARDS_FOR_QUIZ = 4; // mirrors lib/quiz.ts

const STATUS_RANK: Record<PlanStatus, number> = { in_progress: 0, not_started: 1, completed: 2 };
const PRIORITY_RANK: Record<PlanPriority, number> = { high: 0, medium: 1, low: 2 };

function reviewMinutes(cards: number): number {
  return Math.max(2, Math.ceil(cards * 0.5));
}

/**
 * Builds today's plan. Items the user finished stay visible (marked
 * Completed) so the day feels like progress, not an endless list.
 */
export function buildDailyPlanItems(s: DailyPlanSnapshot): PlanItem[] {
  const items: PlanItem[] = [];

  // 1. Due cards — the core SRS habit.
  if (s.dueCount > 0) {
    items.push({
      id: "due",
      title: `Review ${s.dueCount} due ${s.dueCount === 1 ? "card" : "cards"}`,
      reason: "These are scheduled for today — reviewing them on time is what makes spaced repetition work.",
      minutes: reviewMinutes(s.dueCount),
      count: s.dueCount,
      priority: "high",
      status: s.reviewsToday > 0 ? "in_progress" : "not_started",
      href: "/review",
      cta: "Start review",
    });
  } else if (s.reviewsToday > 0) {
    items.push({
      id: "due",
      title: "Due cards reviewed",
      reason: "Nothing left due today — the schedule is clear.",
      minutes: 0,
      count: 0,
      priority: "high",
      status: "completed",
      href: "/review",
      cta: "Review ahead",
    });
  }

  // 2. Recent mistakes — fix what just went wrong.
  if (s.recentMistakeCardCount > 0) {
    const remaining = Math.max(0, s.recentMistakeCardCount - s.mistakeCardsReviewedToday);
    const status: PlanStatus =
      remaining === 0 ? "completed" : s.mistakeCardsReviewedToday > 0 ? "in_progress" : "not_started";
    items.push({
      id: "mistakes",
      title:
        status === "completed"
          ? "Recent mistakes repaired"
          : `Repair ${remaining} recent ${remaining === 1 ? "mistake" : "mistakes"}`,
      reason: "Words you missed in the last two weeks — fixing them now stops them from becoming habits.",
      minutes: status === "completed" ? 0 : reviewMinutes(remaining) + 1,
      count: remaining,
      priority: remaining >= 3 ? "high" : "medium",
      status,
      href: "/review?mode=mistakes",
      cta: "Practice mistakes",
    });
  }

  // 3. Weak words — long-term problem cards.
  if (s.weakCount > 0) {
    const target = Math.min(s.weakCount, 5);
    const done = s.weakCardsReviewedToday >= target;
    items.push({
      id: "weak",
      title: done
        ? "Weak words practised"
        : `Practice ${Math.min(s.weakCount, 8)} weak ${s.weakCount === 1 ? "word" : "words"}`,
      reason: "Cards with repeated lapses or low accuracy — extra practice fixes them fastest.",
      minutes: done ? 0 : reviewMinutes(Math.min(s.weakCount, 8)),
      count: Math.min(s.weakCount, 8),
      priority: "medium",
      status: done ? "completed" : s.weakCardsReviewedToday > 0 ? "in_progress" : "not_started",
      href: "/review?mode=weak",
      cta: "Practice weak words",
    });
  }

  // 4. Writing practice — use the day's problem words in real sentences.
  //    Target pool precedence: recent mistakes (high) → weak words (medium)
  //    → due cards (low). Hidden entirely when there is nothing to write
  //    with and nothing was written today.
  const writingTarget =
    s.recentMistakeCardCount > 0
      ? {
          mode: "mistakes",
          available: s.recentMistakeCardCount,
          priority: "high" as PlanPriority,
          title: "Practice writing with your mistakes",
          reason: "Use the words you keep missing in real sentences to make them stick.",
        }
      : s.weakCount > 0
        ? {
            mode: "weak",
            available: s.weakCount,
            priority: "medium" as PlanPriority,
            title: "Practice writing with weak words",
            reason: "Use your weak vocabulary in real sentences to make it stick.",
          }
        : s.dueCount > 0
          ? {
              mode: "due",
              available: s.dueCount,
              priority: "low" as PlanPriority,
              title: "Practice writing with due words",
              reason: "Writing with today's due words beats re-reading them.",
            }
          : null;
  const wroteToday = s.writingAttemptsToday > 0;
  if (writingTarget || wroteToday) {
    items.push({
      id: "writing",
      title: wroteToday ? "Writing practice done" : writingTarget!.title,
      reason: wroteToday
        ? "You saved a writing attempt today — great active recall."
        : writingTarget!.reason,
      minutes: wroteToday ? 0 : 5,
      count: wroteToday ? 0 : Math.min(writingTarget!.available, 10),
      priority: writingTarget?.priority ?? "low",
      status: wroteToday ? "completed" : "not_started",
      href: writingTarget ? `/writing?mode=${writingTarget.mode}` : "/writing",
      cta: "Start writing practice",
    });
  }

  // 5. Vocabulary quiz — active recall beats re-reading.
  if (s.totalCards >= MIN_CARDS_FOR_QUIZ) {
    items.push({
      id: "vocab-quiz",
      title: "Take a vocabulary quiz",
      reason: "Quizzes test you harder than flipping cards and feed the mistake tracker.",
      minutes: 5,
      count: 0,
      priority: "medium",
      status: s.finishedVocabQuizToday
        ? "completed"
        : s.startedVocabQuizToday
          ? "in_progress"
          : "not_started",
      href: "/quiz/vocab",
      cta: "Start vocab quiz",
    });
  }

  // 6. Grammar quiz — aimed at the weakest topic when one stands out.
  items.push({
    id: "grammar-quiz",
    title: s.weakestGrammarTopic
      ? `Grammar quiz: ${s.weakestGrammarTopic.title}`
      : "Take a grammar quiz",
    reason: s.weakestGrammarTopic
      ? `"${s.weakestGrammarTopic.title}" is your weakest topic — the quiz will focus on it.`
      : "Keeps grammar fresh alongside vocabulary.",
    minutes: 5,
    count: 0,
    priority: s.weakestGrammarTopic ? "medium" : "low",
    status: s.finishedGrammarQuizToday
      ? "completed"
      : s.startedGrammarQuizToday
        ? "in_progress"
        : "not_started",
    href: "/quiz/grammar",
    cta: "Start grammar quiz",
  });

  // Active tasks first (by priority), completed ones sink to the bottom.
  return items.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  );
}

/** True when there is nothing actionable left today. */
export function isPlanDone(items: PlanItem[]): boolean {
  return items.every((i) => i.status === "completed");
}

/** Total remaining minutes across unfinished tasks. */
export function planMinutesLeft(items: PlanItem[]): number {
  return items.filter((i) => i.status !== "completed").reduce((sum, i) => sum + i.minutes, 0);
}
