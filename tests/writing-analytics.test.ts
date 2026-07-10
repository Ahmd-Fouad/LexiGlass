// Tests for writing-practice analytics (lib/writing-analytics.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWritingStats,
  TREND_MIN_ATTEMPTS,
  type WritingAttemptRow,
} from "../lib/writing-analytics";

const NOW = new Date("2026-07-10T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

function makeRow(overrides: Partial<WritingAttemptRow> = {}): WritingAttemptRow {
  return {
    mode: "weak",
    score: 70,
    createdAt: daysAgo(1),
    feedback: {
      wordCount: 40,
      usedTargets: ["thrive", "resilient"],
      missingTargets: [],
      incompleteTargets: [],
    },
    promptWords: [{ text: "thrive" }, { text: "resilient" }, { text: "subtle" }],
    ...overrides,
  };
}

describe("buildWritingStats", () => {
  it("returns a clean empty shape when there are no attempts", () => {
    const stats = buildWritingStats([], { now: NOW });
    assert.equal(stats.totalAttempts, 0);
    assert.equal(stats.averageScore, 0);
    assert.equal(stats.bestScore, 0);
    assert.equal(stats.last7Days, 0);
    assert.equal(stats.last30Days, 0);
    assert.equal(stats.trend, null);
    assert.deepEqual(stats.mostMissedTargets, []);
    assert.deepEqual(stats.recent, []);
  });

  it("computes total, average and best score", () => {
    const stats = buildWritingStats(
      [makeRow({ score: 60 }), makeRow({ score: 90 }), makeRow({ score: 75 })],
      { now: NOW }
    );
    assert.equal(stats.totalAttempts, 3);
    assert.equal(stats.averageScore, 75);
    assert.equal(stats.bestScore, 90);
  });

  it("counts attempts inside the 7- and 30-day windows", () => {
    const stats = buildWritingStats(
      [
        makeRow({ createdAt: daysAgo(1) }),
        makeRow({ createdAt: daysAgo(6) }),
        makeRow({ createdAt: daysAgo(20) }),
        makeRow({ createdAt: daysAgo(45) }),
      ],
      { now: NOW }
    );
    assert.equal(stats.last7Days, 2);
    assert.equal(stats.last30Days, 3);
    assert.equal(stats.totalAttempts, 4);
  });

  it("reports no trend until there are enough attempts", () => {
    const rows = Array.from({ length: TREND_MIN_ATTEMPTS - 1 }, (_, i) =>
      makeRow({ createdAt: daysAgo(10 - i) })
    );
    assert.equal(buildWritingStats(rows, { now: NOW }).trend, null);
  });

  it("detects an improving trend (newer attempts score higher)", () => {
    const rows = [
      makeRow({ score: 50, createdAt: daysAgo(8) }),
      makeRow({ score: 55, createdAt: daysAgo(6) }),
      makeRow({ score: 75, createdAt: daysAgo(3) }),
      makeRow({ score: 85, createdAt: daysAgo(1) }),
    ];
    assert.equal(buildWritingStats(rows, { now: NOW }).trend, "improving");
  });

  it("detects a declining trend regardless of the input row order", () => {
    const rows = [
      makeRow({ score: 40, createdAt: daysAgo(1) }), // newest first on purpose
      makeRow({ score: 50, createdAt: daysAgo(2) }),
      makeRow({ score: 85, createdAt: daysAgo(8) }),
      makeRow({ score: 80, createdAt: daysAgo(6) }),
    ];
    assert.equal(buildWritingStats(rows, { now: NOW }).trend, "declining");
  });

  it("calls similar halves steady", () => {
    const rows = [
      makeRow({ score: 70, createdAt: daysAgo(8) }),
      makeRow({ score: 72, createdAt: daysAgo(6) }),
      makeRow({ score: 71, createdAt: daysAgo(3) }),
      makeRow({ score: 73, createdAt: daysAgo(1) }),
    ];
    assert.equal(buildWritingStats(rows, { now: NOW }).trend, "steady");
  });

  it("aggregates the most-missed targets across attempts (missing + incomplete)", () => {
    const rows = [
      makeRow({ feedback: { missingTargets: ["get rid of"], incompleteTargets: [] } }),
      makeRow({ feedback: { missingTargets: ["Get rid of", "subtle"], incompleteTargets: [] } }),
      makeRow({ feedback: { missingTargets: [], incompleteTargets: ["get rid of"] } }),
    ];
    const stats = buildWritingStats(rows, { now: NOW });
    assert.deepEqual(stats.mostMissedTargets[0], { text: "get rid of", count: 3 });
    assert.deepEqual(stats.mostMissedTargets[1], { text: "subtle", count: 1 });
  });

  it("lists recent attempts newest first with per-attempt details", () => {
    const rows = [
      makeRow({ mode: "weak", score: 60, createdAt: daysAgo(5) }),
      makeRow({
        mode: "phrases",
        score: 90,
        createdAt: daysAgo(1),
        feedback: { wordCount: 55, usedTargets: ["a", "b", "c"], missingTargets: [] },
        promptWords: [{}, {}, {}, {}],
      }),
    ];
    const stats = buildWritingStats(rows, { now: NOW });
    assert.equal(stats.recent.length, 2);
    assert.equal(stats.recent[0].mode, "phrases");
    assert.equal(stats.recent[0].score, 90);
    assert.equal(stats.recent[0].wordCount, 55);
    assert.equal(stats.recent[0].usedCount, 3);
    assert.equal(stats.recent[0].targetCount, 4);
    assert.equal(stats.recent[1].mode, "weak");
  });

  it("respects the recent-attempts limit", () => {
    const rows = Array.from({ length: 9 }, (_, i) => makeRow({ createdAt: daysAgo(i) }));
    assert.equal(buildWritingStats(rows, { now: NOW }).recent.length, 5);
    assert.equal(buildWritingStats(rows, { now: NOW, recentLimit: 3 }).recent.length, 3);
  });

  it("tolerates malformed or missing feedback JSON without crashing", () => {
    const rows = [
      makeRow({ feedback: null, promptWords: null, createdAt: daysAgo(1) }), // newest
      makeRow({ feedback: "garbage", promptWords: "garbage", createdAt: daysAgo(2) }),
      makeRow({
        feedback: { wordCount: "not a number", missingTargets: [1, 2, "real"] },
        createdAt: daysAgo(3),
      }),
    ];
    const stats = buildWritingStats(rows, { now: NOW });
    assert.equal(stats.totalAttempts, 3);
    assert.equal(stats.recent[0].wordCount, 0);
    assert.equal(stats.recent[0].targetCount, 0);
    // Only the well-formed string survives the missing-target aggregation.
    assert.deepEqual(stats.mostMissedTargets, [{ text: "real", count: 1 }]);
  });

  it("only aggregates the rows it is given (user scoping happens in the fetcher)", () => {
    // Ownership-safe by construction: the pure function cannot reach other
    // users' data — the DB fetcher (getWritingStats) filters by userId.
    const mine = [makeRow({ score: 80 }), makeRow({ score: 60 })];
    const stats = buildWritingStats(mine, { now: NOW });
    assert.equal(stats.totalAttempts, mine.length);
    assert.equal(stats.averageScore, 70);
    assert.equal(stats.bestScore, 80);
  });
});
