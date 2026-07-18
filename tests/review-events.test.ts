import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReviewTransition, reviewSnapshotData } from "../lib/review-events";
import { MAX_INTERVAL_DAYS } from "../lib/srs";

const before = {
  easeFactor: 2.5,
  intervalDays: 3,
  dueDate: new Date("2026-07-18T00:00:00.000Z"),
  reviewCount: 7,
  correctCount: 5,
  incorrectCount: 2,
  lapses: 1,
  lastReviewedAt: new Date("2026-07-17T00:00:00.000Z"),
};

describe("durable review transitions", () => {
  it("captures every changed field before and after an action", () => {
    const at = new Date("2026-07-18T12:00:00.000Z");
    const transition = buildReviewTransition(before, "good", at);
    const snapshot = reviewSnapshotData(transition);
    assert.equal(snapshot.reviewCountBefore, 7);
    assert.equal(snapshot.reviewCountAfter, 8);
    assert.equal(snapshot.correctCountBefore, 5);
    assert.equal(snapshot.correctCountAfter, 6);
    assert.equal(snapshot.lastReviewedAtBefore?.toISOString(), "2026-07-17T00:00:00.000Z");
    assert.equal(snapshot.lastReviewedAtAfter?.toISOString(), at.toISOString());
  });

  it("an exact undo state is the captured before state", () => {
    const transition = buildReviewTransition(before, "again", new Date("2026-07-18T12:00:00.000Z"));
    assert.deepEqual(transition.before, before);
    assert.equal(transition.after.incorrectCount, before.incorrectCount + 1);
    assert.equal(transition.after.lapses, before.lapses + 1);
  });

  it("preserves the seven-day interval cap", () => {
    const transition = buildReviewTransition({ ...before, intervalDays: 6.5 }, "easy");
    assert.equal(transition.after.intervalDays, MAX_INTERVAL_DAYS);
  });

  it("different actions can transition sequentially without losing counters", () => {
    const first = buildReviewTransition(before, "good", new Date("2026-07-18T10:00:00.000Z"));
    const second = buildReviewTransition(first.after, "hard", new Date("2026-07-18T11:00:00.000Z"));
    assert.equal(second.after.reviewCount, before.reviewCount + 2);
    assert.equal(second.after.correctCount, before.correctCount + 2);
  });
});

