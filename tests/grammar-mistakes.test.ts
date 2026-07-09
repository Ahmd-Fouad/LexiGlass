// Tests for the GrammarMistake practice/resolve pure logic and the
// dedupe rule that keeps the Mistake Bank from showing the same grammar
// issue twice (topic-level QuizAnswer aggregation vs. per-question
// GrammarMistake records). DB-backed ownership checks (practiceGrammarMistake
// / resolveGrammarMistake returning null for a mistake owned by another user)
// follow the same findFirst/userId-scoped pattern used across the app and are
// verified end-to-end against the real database, consistent with the rest of
// this test suite's DB-backed functions.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeRecordTopicIds,
  applyMistakePractice,
  excludeTopicsCoveredByRecords,
  isMistakeAnswerCorrect,
} from "../lib/grammar-mistakes";
import type { GrammarMistakeItem } from "../lib/analytics";

/* ---------------- isMistakeAnswerCorrect ---------------- */

describe("isMistakeAnswerCorrect", () => {
  it("matches identical text", () => {
    assert.equal(isMistakeAnswerCorrect("She walks to school.", "She walks to school."), true);
  });

  it("ignores case, punctuation and extra whitespace", () => {
    assert.equal(isMistakeAnswerCorrect("she   WALKS to school", "She walks to school."), true);
  });

  it("rejects a genuinely different answer", () => {
    assert.equal(isMistakeAnswerCorrect("She walk to school.", "She walks to school."), false);
  });

  it("rejects an empty answer against a real one", () => {
    assert.equal(isMistakeAnswerCorrect("", "She walks to school."), false);
  });
});

/* ---------------- applyMistakePractice ---------------- */

describe("applyMistakePractice", () => {
  it("marks a correct attempt as practiced with no mistake-count change", () => {
    const outcome = applyMistakePractice(true);
    assert.equal(outcome.status, "practiced");
    assert.equal(outcome.mistakeCountDelta, 0);
  });

  it("keeps a wrong attempt active and increments the mistake count", () => {
    const outcome = applyMistakePractice(false);
    assert.equal(outcome.status, "active");
    assert.equal(outcome.mistakeCountDelta, 1);
  });
});

/* ---------------- activeRecordTopicIds / excludeTopicsCoveredByRecords ---------------- */

function topicItem(id: string, over: Partial<GrammarMistakeItem> = {}): GrammarMistakeItem {
  return {
    type: "grammar",
    id,
    title: `Topic ${id}`,
    difficulty: "medium",
    wrong: 2,
    total: 5,
    accuracy: 60,
    lastMistakeAt: new Date(),
    lastWrongAnswer: null,
    isRecent: true,
    priority: 10,
    ...over,
  };
}

describe("activeRecordTopicIds", () => {
  it("collects topic ids from non-resolved records only", () => {
    const ids = activeRecordTopicIds([
      { grammarTopicId: "t1", status: "active" },
      { grammarTopicId: "t2", status: "practiced" },
      { grammarTopicId: "t3", status: "resolved" },
      { grammarTopicId: null, status: "active" },
    ]);
    assert.deepEqual([...ids].sort(), ["t1", "t2"]);
  });
});

describe("excludeTopicsCoveredByRecords", () => {
  it("removes topic-level items whose topic already has an active GrammarMistake record", () => {
    const items = [topicItem("t1"), topicItem("t2"), topicItem("t3")];
    const result = excludeTopicsCoveredByRecords(items, new Set(["t2"]));
    assert.deepEqual(result.map((i) => i.id), ["t1", "t3"]);
  });

  it("keeps every item when no topic has a covering record", () => {
    const items = [topicItem("t1"), topicItem("t2")];
    const result = excludeTopicsCoveredByRecords(items, new Set());
    assert.equal(result.length, 2);
  });

  it("removes everything when every topic is covered", () => {
    const items = [topicItem("t1"), topicItem("t2")];
    const result = excludeTopicsCoveredByRecords(items, new Set(["t1", "t2"]));
    assert.equal(result.length, 0);
  });
});
