// Tests for the spaced-repetition rating logic (lib/srs.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRating,
  MAX_INTERVAL_DAYS,
  ratingFromCorrectness,
  ratingWasCorrect,
} from "../lib/srs";

const NOW = new Date("2026-07-09T10:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("applyRating", () => {
  it("'again' resets the card so it is due right now", () => {
    const next = applyRating({ easeFactor: 2.5, intervalDays: 5 }, "again", NOW);
    assert.equal(next.intervalDays, 0);
    assert.equal(next.dueDate.getTime(), NOW.getTime());
  });

  it("'again' lowers the ease factor but never below the minimum", () => {
    const next = applyRating({ easeFactor: 2.5, intervalDays: 5 }, "again", NOW);
    assert.equal(next.easeFactor, 2.3);
    const floor = applyRating({ easeFactor: 1.3, intervalDays: 5 }, "again", NOW);
    assert.equal(floor.easeFactor, 1.3);
  });

  it("'hard' gives small progress on a new card (half a day)", () => {
    const next = applyRating({ easeFactor: 2.5, intervalDays: 0 }, "hard", NOW);
    assert.equal(next.intervalDays, 0.5);
  });

  it("'hard' grows an existing interval slowly", () => {
    const next = applyRating({ easeFactor: 2.5, intervalDays: 2 }, "hard", NOW);
    assert.equal(next.intervalDays, 2.4); // 2 * 1.2
    assert.ok(next.easeFactor < 2.5);
  });

  it("'good' moves a new card to 1 day", () => {
    const next = applyRating({ easeFactor: 2.5, intervalDays: 0 }, "good", NOW);
    assert.equal(next.intervalDays, 1);
    assert.equal(next.dueDate.getTime(), NOW.getTime() + DAY_MS);
  });

  it("'good' multiplies the interval by the ease factor", () => {
    const next = applyRating({ easeFactor: 2.5, intervalDays: 2 }, "good", NOW);
    assert.equal(next.intervalDays, 5); // 2 * 2.5
  });

  it("'easy' increases the interval more than 'good' and raises ease", () => {
    const good = applyRating({ easeFactor: 2.0, intervalDays: 1 }, "good", NOW);
    const easy = applyRating({ easeFactor: 2.0, intervalDays: 1 }, "easy", NOW);
    assert.ok(easy.intervalDays > good.intervalDays);
    assert.equal(easy.easeFactor, 2.1);
  });

  it("caps every interval at 7 days", () => {
    for (const rating of ["hard", "good", "easy"] as const) {
      const next = applyRating({ easeFactor: 3.0, intervalDays: 6.5 }, rating, NOW);
      assert.ok(
        next.intervalDays <= MAX_INTERVAL_DAYS,
        `${rating} produced ${next.intervalDays} days`
      );
    }
    const capped = applyRating({ easeFactor: 2.5, intervalDays: 5 }, "good", NOW);
    assert.equal(capped.intervalDays, MAX_INTERVAL_DAYS); // 12.5 → 7
  });

  it("never raises the ease factor above the maximum", () => {
    const next = applyRating({ easeFactor: 3.0, intervalDays: 1 }, "easy", NOW);
    assert.equal(next.easeFactor, 3.0);
  });
});

describe("rating helpers", () => {
  it("'again' counts as incorrect, everything else as correct", () => {
    assert.equal(ratingWasCorrect("again"), false);
    assert.equal(ratingWasCorrect("hard"), true);
    assert.equal(ratingWasCorrect("good"), true);
    assert.equal(ratingWasCorrect("easy"), true);
  });

  it("maps quiz correctness to good/again", () => {
    assert.equal(ratingFromCorrectness(true), "good");
    assert.equal(ratingFromCorrectness(false), "again");
  });
});
