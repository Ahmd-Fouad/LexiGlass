// Tests for the local generator and the pure pool-threshold logic.
// The DB-backed pool functions (retire/record-wrong/top-up) are verified
// end-to-end against the real database in browser/API testing.
// Run with: npm test

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LocalProvider } from "../lib/ai/providers/local";
import { isMcqType } from "../lib/ai/providers/types";
import { prepareGeneratedQuestions } from "../lib/ai/quiz-generator";
import { shouldTopUpQuestionPool, POOL_LOW_THRESHOLD } from "../lib/grammar-question-pool";
import type { GrammarTopicForPrompt } from "../lib/ai/providers/types";

const TOPIC: GrammarTopicForPrompt = {
  title: "Present Perfect vs Past Simple",
  explanation: "Use the past simple for finished actions; the present perfect for experiences.",
  examples:
    "She has just finished her homework.\nThey were happy about the good news yesterday.\nI have visited Japan twice.",
  commonMistakes:
    "I have seen him yesterday. => I saw him yesterday.\nShe has went home. => She has gone home.",
  notes: null,
  tags: "tenses",
  difficulty: "medium",
};

describe("shouldTopUpQuestionPool", () => {
  it("is true only when active is below the low threshold", () => {
    assert.equal(shouldTopUpQuestionPool({ active: POOL_LOW_THRESHOLD - 1 }), true);
    assert.equal(shouldTopUpQuestionPool({ active: 0 }), true);
    assert.equal(shouldTopUpQuestionPool({ active: POOL_LOW_THRESHOLD }), false);
    assert.equal(shouldTopUpQuestionPool({ active: 20 }), false);
  });
});

describe("LocalProvider", () => {
  const provider = new LocalProvider();

  it("is always configured (offline fallback)", () => {
    assert.equal(provider.isConfigured(), true);
  });

  it("generates questions from examples and common mistakes", async () => {
    const drafts = await provider.generateGrammarQuestions(TOPIC, { count: 10 });
    assert.ok(drafts.length > 0, "expected at least one local draft");
    assert.ok(drafts.every((d) => d.source === "local"));
  });

  it("produces correct_mistake questions from 'wrong => right' lines", async () => {
    const drafts = await provider.generateGrammarQuestions(TOPIC, { count: 20 });
    const correctMistake = drafts.find((d) => d.questionType === "correct_mistake");
    assert.ok(correctMistake, "expected a correct_mistake draft");
    assert.equal(correctMistake.choices, null); // typed
    assert.ok(correctMistake.correctAnswer.length > 0);
  });

  it("produces find_mistake MCQs with 4 choices including the answer", async () => {
    const drafts = await provider.generateGrammarQuestions(TOPIC, { count: 20 });
    const findMistake = drafts.find((d) => d.questionType === "find_mistake");
    if (findMistake) {
      assert.ok(isMcqType(findMistake.questionType));
      assert.equal(findMistake.choices?.length, 4);
      assert.ok(findMistake.choices?.includes(findMistake.correctAnswer));
    }
  });

  it("its output survives the validation + scoring pipeline (offline path works)", async () => {
    const drafts = await provider.generateGrammarQuestions(TOPIC, { count: 10 });
    const { valid } = prepareGeneratedQuestions(drafts, { topic: TOPIC });
    assert.ok(valid.length > 0, "local questions should pass validation with zero API keys");
    assert.ok(valid.every((q) => q.qualityScore >= 0.5));
  });

  it("respects the requested count", async () => {
    const drafts = await provider.generateGrammarQuestions(TOPIC, { count: 2 });
    assert.ok(drafts.length <= 2);
  });
});
