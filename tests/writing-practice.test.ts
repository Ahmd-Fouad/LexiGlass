// Tests for Writing Practice (lib/writing-practice.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeWritingAttempt,
  detectTargetUsage,
  scoreWritingAttempt,
  selectWritingTargets,
  type WritingTarget,
} from "../lib/writing-practice";
import type { AnalyzableCard } from "../lib/analytics";

const NOW = new Date("2026-07-10T10:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

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
    dueDate: daysAgo(-1), // not due by default
    reviewCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    lapses: 0,
    lastReviewedAt: null,
    createdAt: daysAgo(10),
    ...overrides,
  };
}

function target(text: string, kind: "word" | "phrase" = text.includes(" ") ? "phrase" : "word"): WritingTarget {
  return { id: text, text, kind, meaning: "", translation: null, example: null };
}

describe("selectWritingTargets", () => {
  it("weak mode only selects struggling cards", () => {
    const weak = makeCard({ lapses: 3 });
    const strong = makeCard({ reviewCount: 5, correctCount: 5 });
    const picked = selectWritingTargets([strong, weak], "weak", { now: NOW });
    assert.deepEqual(picked.map((t) => t.id), [weak.id]);
  });

  it("due mode only selects cards due now", () => {
    const due = makeCard({ dueDate: daysAgo(1) });
    const future = makeCard({ dueDate: daysAgo(-5) });
    const picked = selectWritingTargets([future, due], "due", { now: NOW });
    assert.deepEqual(picked.map((t) => t.id), [due.id]);
  });

  it("mistakes mode only selects recently-missed cards", () => {
    const missed = makeCard();
    const fine = makeCard();
    const picked = selectWritingTargets([fine, missed], "mistakes", {
      now: NOW,
      recentMistakes: new Map([[missed.id, 2]]),
    });
    assert.deepEqual(picked.map((t) => t.id), [missed.id]);
  });

  it("phrases mode only selects phrase cards", () => {
    const phrase = makeCard({ kind: "phrase", text: "get rid of" });
    const word = makeCard({ kind: "word" });
    const picked = selectWritingTargets([word, phrase], "phrases", { now: NOW });
    assert.deepEqual(picked.map((t) => t.id), [phrase.id]);
  });

  it("tag mode selects cards carrying the tag (case-insensitive)", () => {
    const travel = makeCard({ tags: "Travel, verbs" });
    const work = makeCard({ tags: "work" });
    const picked = selectWritingTargets([work, travel], "tag", { now: NOW, tag: "travel" });
    assert.deepEqual(picked.map((t) => t.id), [travel.id]);
  });

  it("clamps the count to 3–10", () => {
    const cards = Array.from({ length: 20 }, () => makeCard());
    assert.equal(selectWritingTargets(cards, "random", { now: NOW, count: 1 }).length, 3);
    assert.equal(selectWritingTargets(cards, "random", { now: NOW, count: 50 }).length, 10);
    assert.equal(selectWritingTargets(cards, "random", { now: NOW, count: 6 }).length, 6);
  });
});

describe("detectTargetUsage", () => {
  it("detects a single target word", () => {
    const u = detectTargetUsage("They restrict access to the files.", target("restrict"));
    assert.equal(u.used, true);
    assert.equal(u.complete, true);
  });

  it("detects a full target phrase", () => {
    const u = detectTargetUsage("I need to get rid of old files.", target("get rid of"));
    assert.equal(u.used, true);
    assert.equal(u.complete, true);
    assert.equal(u.partial, false);
  });

  it("flags an incomplete phrase", () => {
    const u = detectTargetUsage("I finally got rid of it.", target("get rid of"));
    assert.equal(u.complete, false);
    assert.equal(u.partial, true); // "rid" present, full phrase not
  });

  it("does not match a target inside a longer word", () => {
    const u = detectTargetUsage("She has a winning smile.", target("win"));
    assert.equal(u.used, false);
  });
});

describe("analyzeWritingAttempt", () => {
  const restrict = target("restrict");
  const phrase = target("get rid of");

  it("reports used and missing targets", () => {
    const fb = analyzeWritingAttempt(
      "The new rules restrict how we share files. It is a fair policy overall.",
      [restrict, phrase]
    );
    assert.ok(fb.usedTargets.includes("restrict"));
    assert.ok(fb.missingTargets.includes("get rid of"));
  });

  it("detects an incomplete phrase and warns to use it completely", () => {
    const fb = analyzeWritingAttempt("I finally got rid of it yesterday.", [phrase]);
    assert.ok(fb.incompleteTargets.includes("get rid of"));
    assert.ok(fb.warnings.some((w) => /used completely/i.test(w)));
  });

  it("warns about missing end punctuation", () => {
    const fb = analyzeWritingAttempt("I restrict access to the files", [restrict]);
    assert.equal(fb.endsWithPunctuation, false);
    assert.ok(fb.warnings.some((w) => /punctuation/i.test(w)));
  });

  it("warns about missing capitalization", () => {
    const fb = analyzeWritingAttempt("the manager will restrict access to the files.", [restrict]);
    assert.equal(fb.capitalizationOk, false);
    assert.ok(fb.warnings.some((w) => /capital letter/i.test(w)));
  });

  it("warns about repeated words", () => {
    const fb = analyzeWritingAttempt(
      "The project project project needs more work on the project details.",
      [target("project")]
    );
    assert.ok(fb.repeatedWords.includes("project"));
    assert.ok(fb.warnings.some((w) => /repeat/i.test(w)));
  });

  it("flags a possible spelling mistake near a target word", () => {
    const fb = analyzeWritingAttempt("They restrikt access to the files.", [restrict]);
    assert.ok(fb.possibleSpelling.some((s) => s.target === "restrict"));
  });
});

describe("scoreWritingAttempt", () => {
  const targets = [target("restrict"), target("get rid of")];

  it("is 0 for empty writing", () => {
    const fb = analyzeWritingAttempt("", targets);
    assert.equal(fb.score, 0);
  });

  it("rewards using all targets in clean, full sentences", () => {
    const good = analyzeWritingAttempt(
      "The company will restrict access to the sensitive files. We should get rid of the old documents to stay organized.",
      targets
    );
    const poor = analyzeWritingAttempt("i restrict stuff", targets);
    assert.ok(good.score > poor.score);
    assert.ok(good.score >= 70, `expected a strong score, got ${good.score}`);
    assert.ok(good.score <= 100);
  });

  it("scoreWritingAttempt matches the score embedded by analyze", () => {
    const fb = analyzeWritingAttempt(
      "We must restrict access. Please get rid of duplicates.",
      targets
    );
    const { score: _score, ...analysis } = fb;
    assert.equal(scoreWritingAttempt(analysis), fb.score);
  });
});
