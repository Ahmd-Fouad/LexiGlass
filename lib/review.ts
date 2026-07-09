// Review-session building logic: which cards to show and in what order.
//
// Everything here is pure (no database access) so it can be unit-tested.
// Pages/API routes fetch the cards + recent mistake data and call these.
//
// Modes:
//   due      → cards whose dueDate has passed (the normal SRS review)
//   weak     → cards the user keeps getting wrong (lapses / low accuracy)
//   mistakes → cards answered wrong in a quiz or rated "Again" recently
//   mixed    → due + weak + recent mistakes combined (powers the daily plan)

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewMode = "due" | "weak" | "mistakes" | "mixed";

export const REVIEW_MODE_LABELS: Record<ReviewMode, string> = {
  due: "Due review",
  weak: "Weak words",
  mistakes: "Mistake repair",
  mixed: "Mixed daily review",
};

/** The card fields the review logic needs (a structural subset of Flashcard). */
export interface ReviewableCard {
  id: string;
  difficulty: string;
  intervalDays: number;
  dueDate: Date;
  reviewCount: number;
  correctCount: number;
  incorrectCount: number;
  lapses: number;
  lastReviewedAt: Date | null;
  createdAt: Date;
}

/** Times this card was missed recently (wrong quiz answers + "Again" ratings), by card id. */
export type RecentMistakeCounts = Map<string, number>;

export interface ReviewSelectionOptions {
  mode?: ReviewMode;
  size?: number;
  now?: Date;
  recentMistakes?: RecentMistakeCounts;
  /** Only include cards carrying this tag (applies on top of any mode). */
  tag?: string | null;
}

/** Share of correct reviews, 0..1. Cards without reviews count as 0. */
export function cardAccuracy(card: ReviewableCard): number {
  if (card.reviewCount <= 0) return 0;
  return card.correctCount / card.reviewCount;
}

/** A card the user keeps forgetting: repeated lapses or low accuracy. */
export function isWeakCard(card: ReviewableCard): boolean {
  if (card.lapses >= 2) return true;
  if (card.incorrectCount >= 3) return true;
  return card.reviewCount >= 3 && cardAccuracy(card) < 0.6;
}

/** Mirrors the "mastered" definition used on the stats page. */
export function isMasteredCard(card: ReviewableCard): boolean {
  return card.reviewCount >= 4 && cardAccuracy(card) >= 0.8 && card.intervalDays >= 5;
}

/**
 * Priority score for review ordering — higher means "study this sooner".
 *
 * priority = dueScore + overdueScore + lapseScore + recentMistakeScore
 *          + difficultyScore + lowAccuracyScore + oldCardScore
 *          - recentlyReviewedPenalty - masteredPenalty
 */
export function getReviewPriority(
  card: ReviewableCard,
  now: Date = new Date(),
  recentMistakes = 0
): number {
  const isDue = card.dueDate.getTime() <= now.getTime();
  const overdueDays = Math.max(0, (now.getTime() - card.dueDate.getTime()) / DAY_MS);
  const lastSeen = card.lastReviewedAt ?? card.createdAt;
  const daysSinceSeen = Math.max(0, (now.getTime() - lastSeen.getTime()) / DAY_MS);
  const reviewedVeryRecently =
    card.lastReviewedAt != null && now.getTime() - card.lastReviewedAt.getTime() < 6 * 60 * 60 * 1000;

  const dueScore = isDue ? 50 : 0;
  const overdueScore = Math.min(overdueDays, 14) * 3;
  const lapseScore = Math.min(card.lapses, 8) * 4;
  const recentMistakeScore = Math.min(recentMistakes, 5) * 8;
  const difficultyScore = card.difficulty === "hard" ? 8 : card.difficulty === "medium" ? 3 : 0;
  const lowAccuracyScore = card.reviewCount >= 3 ? (1 - cardAccuracy(card)) * 20 : 0;
  const oldCardScore = Math.min(daysSinceSeen, 30) * 0.5;
  const recentlyReviewedPenalty = reviewedVeryRecently ? 15 : 0;
  const masteredPenalty = isMasteredCard(card) ? 20 : 0;

  return (
    dueScore +
    overdueScore +
    lapseScore +
    recentMistakeScore +
    difficultyScore +
    lowAccuracyScore +
    oldCardScore -
    recentlyReviewedPenalty -
    masteredPenalty
  );
}

/**
 * Picks and orders the cards for a review session.
 * Cards are never repeated within one session (each id appears once).
 */
export function selectReviewCards<T extends ReviewableCard & { tags?: string }>(
  cards: T[],
  options: ReviewSelectionOptions = {}
): T[] {
  const { mode = "due", size = 20, now = new Date(), recentMistakes = new Map(), tag } = options;

  let pool = cards;
  if (tag) {
    const wanted = tag.trim().toLowerCase();
    pool = pool.filter((c) =>
      (c.tags ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .includes(wanted)
    );
  }

  const byPriority = (list: T[]) =>
    list
      .map((card) => ({ card, p: getReviewPriority(card, now, recentMistakes.get(card.id) ?? 0) }))
      .sort((a, b) => b.p - a.p)
      .map((s) => s.card);

  switch (mode) {
    case "due":
      return byPriority(pool.filter((c) => c.dueDate.getTime() <= now.getTime())).slice(0, size);

    case "weak":
      return byPriority(pool.filter(isWeakCard)).slice(0, size);

    case "mistakes":
      return byPriority(pool.filter((c) => (recentMistakes.get(c.id) ?? 0) > 0)).slice(0, size);

    case "mixed": {
      const due = byPriority(pool.filter((c) => c.dueDate.getTime() <= now.getTime()));
      const weak = byPriority(pool.filter(isWeakCard));
      const missed = byPriority(pool.filter((c) => (recentMistakes.get(c.id) ?? 0) > 0));

      const seen = new Set<string>();
      const result: T[] = [];
      const add = (list: T[], max: number) => {
        for (const card of list) {
          if (result.length >= size || max <= 0) break;
          if (seen.has(card.id)) continue;
          seen.add(card.id);
          result.push(card);
          max--;
        }
      };

      add(due, Math.ceil(size * 0.5));
      add(missed, Math.ceil(size * 0.2));
      add(weak, size - result.length);
      // Top up with whatever has the highest priority overall.
      add(byPriority(pool), size - result.length);
      return result;
    }
  }
}
