// Tests for the review-session selection logic (lib/review.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cardAccuracy,
  getReviewPriority,
  isMasteredCard,
  isWeakCard,
  selectReviewCards,
  type ReviewableCard,
} from "../lib/review";

const NOW = new Date("2026-07-09T10:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS);
}

let cardSeq = 0;
function makeCard(overrides: Partial<ReviewableCard & { tags: string }> = {}) {
  return {
    id: `card_${++cardSeq}`,
    difficulty: "medium",
    intervalDays: 1,
    dueDate: daysAgo(0),
    reviewCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    lapses: 0,
    lastReviewedAt: null,
    createdAt: daysAgo(10),
    tags: "",
    ...overrides,
  };
}

describe("cardAccuracy", () => {
  it("is correct/reviewCount, and 0 for unreviewed cards", () => {
    assert.equal(cardAccuracy(makeCard()), 0);
    assert.equal(cardAccuracy(makeCard({ reviewCount: 4, correctCount: 3 })), 0.75);
  });
});

describe("isWeakCard", () => {
  it("flags cards with 2+ lapses", () => {
    assert.equal(isWeakCard(makeCard({ lapses: 2 })), true);
    assert.equal(isWeakCard(makeCard({ lapses: 1 })), false);
  });

  it("flags cards with low accuracy after enough reviews", () => {
    assert.equal(isWeakCard(makeCard({ reviewCount: 4, correctCount: 2 })), true); // 50%
    assert.equal(isWeakCard(makeCard({ reviewCount: 4, correctCount: 4 })), false);
    // Too few reviews to judge: not weak yet.
    assert.equal(isWeakCard(makeCard({ reviewCount: 2, correctCount: 0 })), false);
  });

  it("flags cards with many wrong answers", () => {
    assert.equal(isWeakCard(makeCard({ reviewCount: 10, correctCount: 7, incorrectCount: 3 })), true);
  });
});

describe("isMasteredCard", () => {
  it("requires enough reviews, high accuracy and a long interval", () => {
    const mastered = makeCard({ reviewCount: 5, correctCount: 5, intervalDays: 6 });
    assert.equal(isMasteredCard(mastered), true);
    assert.equal(isMasteredCard(makeCard({ reviewCount: 5, correctCount: 5, intervalDays: 2 })), false);
    assert.equal(isMasteredCard(makeCard({ reviewCount: 5, correctCount: 3, intervalDays: 6 })), false);
    assert.equal(isMasteredCard(makeCard({ reviewCount: 2, correctCount: 2, intervalDays: 6 })), false);
  });
});

describe("getReviewPriority", () => {
  it("scores due cards above not-due cards", () => {
    const due = makeCard({ dueDate: daysAgo(0) });
    const later = makeCard({ dueDate: daysAgo(-3) }); // due in 3 days
    assert.ok(getReviewPriority(due, NOW) > getReviewPriority(later, NOW));
  });

  it("scores more-overdue cards higher", () => {
    const veryOverdue = makeCard({ dueDate: daysAgo(5) });
    const justDue = makeCard({ dueDate: daysAgo(0) });
    assert.ok(getReviewPriority(veryOverdue, NOW) > getReviewPriority(justDue, NOW));
  });

  it("scores lapsed cards higher", () => {
    const lapsed = makeCard({ lapses: 4 });
    const clean = makeCard();
    assert.ok(getReviewPriority(lapsed, NOW) > getReviewPriority(clean, NOW));
  });

  it("boosts cards with recent quiz mistakes", () => {
    const card = makeCard();
    assert.ok(getReviewPriority(card, NOW, 3) > getReviewPriority(card, NOW, 0));
  });

  it("penalises mastered cards", () => {
    const mastered = makeCard({ reviewCount: 5, correctCount: 5, intervalDays: 6 });
    const learning = makeCard({ reviewCount: 5, correctCount: 5, intervalDays: 1 });
    assert.ok(getReviewPriority(mastered, NOW) < getReviewPriority(learning, NOW));
  });

  it("penalises cards reviewed within the last few hours", () => {
    const justSeen = makeCard({ lastReviewedAt: new Date(NOW.getTime() - 60 * 60 * 1000) });
    const seenYesterday = makeCard({ lastReviewedAt: daysAgo(1) });
    assert.ok(getReviewPriority(justSeen, NOW) < getReviewPriority(seenYesterday, NOW));
  });
});

describe("selectReviewCards", () => {
  it("mode 'due' returns only due cards, highest priority first", () => {
    const overdue = makeCard({ dueDate: daysAgo(4), lapses: 3 });
    const due = makeCard({ dueDate: daysAgo(0) });
    const future = makeCard({ dueDate: daysAgo(-2) });
    const picked = selectReviewCards([due, future, overdue], { mode: "due", now: NOW });
    assert.deepEqual(picked.map((c) => c.id), [overdue.id, due.id]);
  });

  it("mode 'weak' returns only weak cards", () => {
    const weak = makeCard({ lapses: 3 });
    const strong = makeCard({ reviewCount: 5, correctCount: 5 });
    const picked = selectReviewCards([strong, weak], { mode: "weak", now: NOW });
    assert.deepEqual(picked.map((c) => c.id), [weak.id]);
  });

  it("mode 'mistakes' returns only recently-missed cards", () => {
    const missed = makeCard();
    const fine = makeCard();
    const picked = selectReviewCards([fine, missed], {
      mode: "mistakes",
      now: NOW,
      recentMistakes: new Map([[missed.id, 2]]),
    });
    assert.deepEqual(picked.map((c) => c.id), [missed.id]);
  });

  it("mode 'mixed' combines due, weak and missed cards without repeats", () => {
    const due = makeCard({ dueDate: daysAgo(2) });
    const weak = makeCard({ dueDate: daysAgo(-3), lapses: 3 });
    const missed = makeCard({ dueDate: daysAgo(-3) });
    const filler = makeCard({ dueDate: daysAgo(-5) });
    const picked = selectReviewCards([due, weak, missed, filler], {
      mode: "mixed",
      size: 10,
      now: NOW,
      recentMistakes: new Map([[missed.id, 1]]),
    });
    const ids = picked.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, "no card repeats within a session");
    assert.ok(ids.includes(due.id));
    assert.ok(ids.includes(weak.id));
    assert.ok(ids.includes(missed.id));
    assert.equal(ids[0], due.id, "due cards come first");
  });

  it("respects the session size", () => {
    const cards = Array.from({ length: 40 }, () => makeCard({ dueDate: daysAgo(1) }));
    assert.equal(selectReviewCards(cards, { mode: "due", size: 15, now: NOW }).length, 15);
  });

  it("filters by tag when one is given", () => {
    const tagged = makeCard({ tags: "travel, food" });
    const other = makeCard({ tags: "work" });
    const picked = selectReviewCards([tagged, other], { mode: "due", now: NOW, tag: "food" });
    assert.deepEqual(picked.map((c) => c.id), [tagged.id]);
  });
});
