// Simplified spaced-repetition system, inspired by Anki's SM-2 but easier to reason about.
//
// Every card keeps: easeFactor (growth multiplier), intervalDays, dueDate.
// Ratings:
//   again → card was forgotten. Interval resets, it becomes due immediately.
//   hard  → barely remembered. Interval grows slowly, ease drops slightly.
//   good  → remembered. Interval multiplies by the ease factor.
//   easy  → trivially easy. Interval grows faster and ease increases.
//
// The interval is capped at MAX_INTERVAL_DAYS = 7, which guarantees the
// user's requirement that every card shows up at least once or twice a week.

export type Rating = "again" | "hard" | "good" | "easy";

export const MAX_INTERVAL_DAYS = 7;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;

export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  dueDate: Date;
}

export function applyRating(
  state: { easeFactor: number; intervalDays: number },
  rating: Rating,
  now: Date = new Date()
): SrsState {
  let ease = state.easeFactor;
  let interval = state.intervalDays;

  switch (rating) {
    case "again":
      ease = Math.max(MIN_EASE, ease - 0.2);
      interval = 0; // due again right away (same session / same day)
      break;
    case "hard":
      ease = Math.max(MIN_EASE, ease - 0.05);
      interval = interval <= 0 ? 0.5 : Math.max(1, interval * 1.2);
      break;
    case "good":
      interval = interval <= 0 ? 1 : interval * ease;
      break;
    case "easy":
      ease = Math.min(MAX_EASE, ease + 0.1);
      interval = interval <= 0 ? 3 : interval * ease * 1.3;
      break;
  }

  interval = Math.min(interval, MAX_INTERVAL_DAYS);

  const dueDate = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
  return { easeFactor: round2(ease), intervalDays: round2(interval), dueDate };
}

export function ratingWasCorrect(rating: Rating): boolean {
  return rating !== "again";
}

/** Maps quiz correctness to an SRS rating. */
export function ratingFromCorrectness(isCorrect: boolean): Rating {
  return isCorrect ? "good" : "again";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
