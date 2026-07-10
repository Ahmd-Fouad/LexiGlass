// Tests for pronunciation comparison (lib/pronunciation.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateSpeechSimilarity,
  compareSpokenText,
  getExtraWords,
  getMissingWords,
  normalizeSpokenText,
  selectPronunciationTargets,
  type PronunciationTarget,
} from "../lib/pronunciation";
import type { AnalyzableCard } from "../lib/analytics";

describe("normalizeSpokenText", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    assert.equal(normalizeSpokenText("  Get RID, of! "), "get rid of");
    assert.equal(normalizeSpokenText("don’t"), "don't");
  });
});

describe("compareSpokenText", () => {
  it("reports an exact match (ignoring case and punctuation)", () => {
    const r = compareSpokenText("winning formula", "Winning formula!");
    assert.equal(r.exactMatch, true);
    assert.equal(r.similarity, 100);
    assert.deepEqual(r.missingWords, []);
    assert.deepEqual(r.extraWords, []);
    assert.deepEqual(r.matchedWords, ["winning", "formula"]);
  });

  it("detects missing words", () => {
    const r = compareSpokenText("get rid of", "get of");
    assert.equal(r.exactMatch, false);
    assert.deepEqual(r.missingWords, ["rid"]);
    assert.deepEqual(getMissingWords("get rid of", "get of"), ["rid"]);
  });

  it("detects extra words", () => {
    const r = compareSpokenText("thrive", "i thrive daily");
    assert.deepEqual(r.matchedWords, ["thrive"]);
    assert.deepEqual(r.extraWords.sort(), ["daily", "i"]);
    assert.deepEqual(getExtraWords("thrive", "i thrive daily").sort(), ["daily", "i"]);
  });

  it("ignores punctuation and case in comparison", () => {
    const r = compareSpokenText("Break the ice.", "break the ice");
    assert.equal(r.exactMatch, true);
    assert.equal(r.missingWords.length, 0);
  });

  it("compares a full phrase and finds partial matches", () => {
    const r = compareSpokenText("once in a blue moon", "once in blue moon");
    assert.deepEqual(r.missingWords, ["a"]);
    assert.ok(r.similarity >= 70 && r.similarity < 100);
  });

  it("tolerates a small pronunciation slip on longer words", () => {
    const r = compareSpokenText("meticulous", "meticulus");
    assert.deepEqual(r.matchedWords, ["meticulous"]); // edit distance 1, len ≥ 5
    assert.ok(r.similarity >= 80);
  });
});

describe("calculateSpeechSimilarity", () => {
  it("is 100 for identical, 0 for empty recognition", () => {
    assert.equal(calculateSpeechSimilarity("thrive", "thrive"), 100);
    assert.equal(calculateSpeechSimilarity("thrive", ""), 0);
    assert.equal(calculateSpeechSimilarity("", "thrive"), 0);
  });

  it("scores a closer attempt higher than a further one", () => {
    const close = calculateSpeechSimilarity("get rid of", "get rid off");
    const far = calculateSpeechSimilarity("get rid of", "completely different");
    assert.ok(close > far);
    assert.ok(far < 40);
  });
});

describe("selectPronunciationTargets", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const NOW = new Date("2026-07-10T10:00:00Z");
  let seq = 0;
  function makeCard(overrides: Partial<AnalyzableCard> = {}): AnalyzableCard {
    const id = `card_${++seq}`;
    return {
      id,
      text: `word${seq}`,
      kind: "word",
      meaning: `meaning ${seq}`,
      example: null,
      translation: null,
      tags: "",
      category: null,
      difficulty: "medium",
      intervalDays: 1,
      dueDate: new Date(NOW.getTime() + DAY_MS),
      reviewCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      lapses: 0,
      lastReviewedAt: null,
      createdAt: new Date(NOW.getTime() - 10 * DAY_MS),
      ...overrides,
    };
  }

  it("sentences mode uses the example text as the target", () => {
    const withExample = makeCard({ example: "She kept meticulous records." });
    const withoutExample = makeCard({ example: null });
    const targets = selectPronunciationTargets([withExample, withoutExample], "sentences", { now: NOW });
    assert.equal(targets.length, 1);
    assert.equal(targets[0].kind, "sentence");
    assert.equal(targets[0].text, "She kept meticulous records.");
  });

  it("phrases mode only includes phrase cards, using the phrase text", () => {
    const phrase = makeCard({ kind: "phrase", text: "get rid of" });
    const word = makeCard({ kind: "word" });
    const targets: PronunciationTarget[] = selectPronunciationTargets([phrase, word], "phrases", { now: NOW });
    assert.deepEqual(targets.map((t) => t.text), ["get rid of"]);
    assert.equal(targets[0].kind, "phrase");
  });

  it("weak mode only includes struggling cards", () => {
    const weak = makeCard({ lapses: 3 });
    const strong = makeCard({ reviewCount: 5, correctCount: 5 });
    const targets = selectPronunciationTargets([weak, strong], "weak", { now: NOW });
    assert.deepEqual(targets.map((t) => t.id), [weak.id]);
  });
});
