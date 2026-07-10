// Tests for vocabulary quiz selection, question building and answer checking
// (lib/quiz.ts). Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Flashcard } from "@prisma/client";
import {
  answersMatch,
  buildVocabQuestions,
  isCorrectAnswer,
  levenshtein,
  normalizeAnswer,
  pickDistractors,
  selectQuizCards,
} from "../lib/quiz";

const NOW = new Date("2026-07-09T10:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS);
}

let cardSeq = 0;
function makeCard(overrides: Partial<Flashcard> = {}): Flashcard {
  const id = `card_${++cardSeq}`;
  return {
    id,
    userId: "user_1",
    text: `word${cardSeq}`,
    kind: "word",
    meaning: `meaning of ${id}`,
    translation: null,
    example: null,
    pronunciation: null,
    wordType: null,
    notes: null,
    tags: "",
    category: null,
    difficulty: "medium",
    easeFactor: 2.5,
    intervalDays: 1,
    dueDate: daysAgo(0),
    reviewCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    lapses: 0,
    lastReviewedAt: null,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(0),
    ...overrides,
  };
}

describe("selectQuizCards", () => {
  it("prioritises due cards over not-due cards", () => {
    const due = makeCard({ dueDate: daysAgo(1) });
    const future = makeCard({ dueDate: daysAgo(-5) });
    const picked = selectQuizCards([future, due], { size: 1, now: NOW });
    assert.equal(picked[0].id, due.id);
  });

  it("prioritises cards with recent mistakes", () => {
    const missed = makeCard({ dueDate: daysAgo(-1) });
    const plain = makeCard({ dueDate: daysAgo(-1) });
    const picked = selectQuizCards([plain, missed], {
      size: 1,
      now: NOW,
      recentMistakes: new Map([[missed.id, 3]]),
    });
    assert.equal(picked[0].id, missed.id);
  });

  it("pushes mastered cards down", () => {
    const mastered = makeCard({
      dueDate: daysAgo(-1),
      reviewCount: 6,
      correctCount: 6,
      intervalDays: 6,
    });
    const learning = makeCard({ dueDate: daysAgo(-1), reviewCount: 6, correctCount: 4 });
    const picked = selectQuizCards([mastered, learning], { size: 1, now: NOW });
    assert.equal(picked[0].id, learning.id);
  });

  it("mode 'weak' only includes struggling cards", () => {
    const weak = makeCard({ lapses: 3 });
    const strong = makeCard({ reviewCount: 5, correctCount: 5 });
    const picked = selectQuizCards([strong, weak], { mode: "weak", now: NOW });
    assert.deepEqual(picked.map((c) => c.id), [weak.id]);
  });

  it("mode 'mistakes' only includes recently-missed cards", () => {
    const missed = makeCard();
    const fine = makeCard();
    const picked = selectQuizCards([fine, missed], {
      mode: "mistakes",
      now: NOW,
      recentMistakes: new Map([[missed.id, 1]]),
    });
    assert.deepEqual(picked.map((c) => c.id), [missed.id]);
  });

  it("mode 'tag' only includes cards carrying the tag", () => {
    const travel = makeCard({ tags: "travel, verbs" });
    const work = makeCard({ tags: "work" });
    const picked = selectQuizCards([travel, work], { mode: "tag", tag: "Travel", now: NOW });
    assert.deepEqual(picked.map((c) => c.id), [travel.id]);
  });

  it("respects the requested size", () => {
    const cards = Array.from({ length: 30 }, () => makeCard());
    assert.equal(selectQuizCards(cards, { size: 12, now: NOW }).length, 12);
  });
});

describe("buildVocabQuestions", () => {
  function makePool(n: number): Flashcard[] {
    return Array.from({ length: n }, (_, i) =>
      makeCard({ text: `unique${i}`, meaning: `unique meaning ${i}`, example: `I saw unique${i} yesterday at home.` })
    );
  }

  it("builds one question per selected card", () => {
    const pool = makePool(12);
    const questions = buildVocabQuestions(pool, pool);
    assert.equal(questions.length, 12);
    assert.equal(new Set(questions.map((q) => q.flashcardId)).size, 12);
  });

  it("never builds fill-in-the-blank from an example missing the target", () => {
    const bad = makeCard({ text: "restrict", example: "There are no rules here." });
    // Index 2 in the type cycle would be fill_blank — it must fall back.
    const pool = [...makePool(2), bad, ...makePool(9)];
    const questions = buildVocabQuestions(pool, pool);
    const q = questions.find((x) => x.flashcardId === bad.id);
    assert.ok(q);
    assert.notEqual(q.type, "fill_blank");
  });

  it("blanks out the full phrase for phrase cards", () => {
    const phrase = makeCard({
      text: "winning formula",
      kind: "phrase",
      example: "We finally found a winning formula for studying.",
    });
    // Index 2 in the type cycle is fill_blank.
    const pool = [...makePool(2), phrase, ...makePool(9)];
    const questions = buildVocabQuestions(pool, pool);
    const q = questions.find((x) => x.flashcardId === phrase.id);
    assert.ok(q);
    assert.equal(q.type, "fill_blank");
    assert.equal(q.kind, "phrase");
    assert.ok(q.context?.includes("_____"));
    assert.ok(!q.context?.toLowerCase().includes("winning formula"));
    assert.equal(q.answer, "winning formula");
  });

  it("keeps true/false questions rare (max ~1 in 6)", () => {
    const pool = makePool(18);
    const questions = buildVocabQuestions(pool, pool);
    const tf = questions.filter((q) => q.type === "true_false").length;
    assert.ok(tf <= Math.ceil(questions.length / 6), `${tf} true/false of ${questions.length}`);
  });

  it("multiple-choice options are unique and include the answer", () => {
    const pool = makePool(12);
    const questions = buildVocabQuestions(pool, pool);
    for (const q of questions) {
      if (!q.options) continue;
      const normalized = q.options.map((o) => o.toLowerCase().trim());
      assert.equal(new Set(normalized).size, normalized.length, `duplicate options in: ${q.prompt}`);
      assert.ok(q.options.includes(q.answer), `answer missing from options in: ${q.prompt}`);
    }
  });
});

describe("pickDistractors", () => {
  it("prefers cards of the same kind", () => {
    const target = makeCard({ text: "get rid of", kind: "phrase", meaning: "to remove" });
    const phrases = Array.from({ length: 3 }, (_, i) =>
      makeCard({ text: `phrase ${i}`, kind: "phrase", meaning: `phrase meaning ${i}` })
    );
    const words = Array.from({ length: 3 }, (_, i) =>
      makeCard({ text: `word${i}`, kind: "word", meaning: `word meaning ${i}` })
    );
    const distractors = pickDistractors(target, [...words, ...phrases], 3, (c) => c.text, target.text);
    assert.equal(distractors.length, 3);
    for (const d of distractors) {
      assert.ok(d.startsWith("phrase"), `expected a phrase distractor, got "${d}"`);
    }
  });

  it("never includes the correct answer or duplicates", () => {
    const target = makeCard({ meaning: "to remove" });
    const clone = makeCard({ meaning: "To remove." }); // same after normalisation
    const dup1 = makeCard({ meaning: "to build" });
    const dup2 = makeCard({ meaning: "to build" });
    const other = makeCard({ meaning: "to carry" });
    const distractors = pickDistractors(
      target,
      [clone, dup1, dup2, other],
      3,
      (c) => c.meaning,
      target.meaning
    );
    assert.deepEqual([...distractors].sort(), ["to build", "to carry"]);
  });
});

describe("answer checking", () => {
  it("normalizeAnswer strips case, punctuation and extra spaces", () => {
    assert.equal(normalizeAnswer("  Get RID   of! "), "get rid of");
    assert.equal(normalizeAnswer("don’t"), "don't");
  });

  it("answersMatch ignores case and punctuation", () => {
    assert.ok(answersMatch("Winning formula", "winning formula!"));
    assert.ok(!answersMatch("winning formula", "losing formula"));
  });

  it("isCorrectAnswer accepts one small typo in longer words", () => {
    assert.ok(isCorrectAnswer("restrcit", "restrict") === false); // distance 2 → wrong
    assert.ok(isCorrectAnswer("restrict", "restrict"));
    assert.ok(isCorrectAnswer("restrictt", "restrict")); // one extra letter
    assert.ok(isCorrectAnswer("restict", "restrict")); // one missing letter
  });

  it("isCorrectAnswer gives no typo tolerance to short words", () => {
    assert.ok(!isCorrectAnswer("cat", "car"));
    assert.ok(!isCorrectAnswer("rid", "ride"));
  });

  it("isCorrectAnswer never accepts one word from a phrase", () => {
    assert.ok(!isCorrectAnswer("rid", "get rid of", { kind: "phrase" }));
    assert.ok(!isCorrectAnswer("get rid", "get rid of", { kind: "phrase" }));
    assert.ok(isCorrectAnswer("get rid of", "get rid of", { kind: "phrase" }));
  });

  it("levenshtein computes edit distance", () => {
    assert.equal(levenshtein("abc", "abc"), 0);
    assert.equal(levenshtein("abc", "abd"), 1);
    assert.equal(levenshtein("abc", "ab"), 1);
    assert.equal(levenshtein("kitten", "sitting"), 3);
  });
});
