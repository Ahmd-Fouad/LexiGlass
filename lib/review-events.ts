import { applyRating, ratingWasCorrect, type Rating } from "./srs";

export interface ReviewState {
  easeFactor: number;
  intervalDays: number;
  dueDate: Date;
  reviewCount: number;
  correctCount: number;
  incorrectCount: number;
  lapses: number;
  lastReviewedAt: Date | null;
}

export interface ReviewTransition {
  before: ReviewState;
  after: ReviewState;
  wasCorrect: boolean;
}

/** Pure authoritative state transition shared by online, offline and quiz reviews. */
export function buildReviewTransition(
  current: ReviewState,
  rating: Rating,
  reviewedAt: Date = new Date()
): ReviewTransition {
  const next = applyRating(current, rating, reviewedAt);
  const wasCorrect = ratingWasCorrect(rating);
  return {
    before: { ...current },
    after: {
      easeFactor: next.easeFactor,
      intervalDays: next.intervalDays,
      dueDate: next.dueDate,
      reviewCount: current.reviewCount + 1,
      correctCount: current.correctCount + (wasCorrect ? 1 : 0),
      incorrectCount: current.incorrectCount + (wasCorrect ? 0 : 1),
      lapses: current.lapses + (rating === "again" ? 1 : 0),
      lastReviewedAt: reviewedAt,
    },
    wasCorrect,
  };
}

export function reviewStateUpdate(state: ReviewState) {
  return {
    easeFactor: state.easeFactor,
    intervalDays: state.intervalDays,
    dueDate: state.dueDate,
    reviewCount: state.reviewCount,
    correctCount: state.correctCount,
    incorrectCount: state.incorrectCount,
    lapses: state.lapses,
    lastReviewedAt: state.lastReviewedAt,
  };
}

export function reviewSnapshotData(transition: ReviewTransition) {
  const { before, after } = transition;
  return {
    intervalBefore: before.intervalDays,
    intervalAfter: after.intervalDays,
    easeFactorBefore: before.easeFactor,
    easeFactorAfter: after.easeFactor,
    dueDateBefore: before.dueDate,
    dueDateAfter: after.dueDate,
    reviewCountBefore: before.reviewCount,
    reviewCountAfter: after.reviewCount,
    correctCountBefore: before.correctCount,
    correctCountAfter: after.correctCount,
    incorrectCountBefore: before.incorrectCount,
    incorrectCountAfter: after.incorrectCount,
    lapsesBefore: before.lapses,
    lapsesAfter: after.lapses,
    lastReviewedAtBefore: before.lastReviewedAt,
    lastReviewedAtAfter: after.lastReviewedAt,
  };
}

