// Tests for grammar quiz generation and weak-topic selection (lib/grammar-quiz.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GrammarTopic } from "@prisma/client";
import {
  buildGrammarQuiz,
  corruptSentence,
  questionsFromTopic,
  sortTopicsByWeakness,
  topicWeakness,
  type TopicStatsMap,
} from "../lib/grammar-quiz";

let topicSeq = 0;
function makeTopic(overrides: Partial<GrammarTopic> = {}): GrammarTopic {
  const id = `topic_${++topicSeq}`;
  return {
    id,
    userId: "user_1",
    title: `Topic ${topicSeq}`,
    explanation: "A useful grammar explanation for the topic.",
    examples: "",
    commonMistakes: "",
    notes: null,
    tags: "",
    difficulty: "medium",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

describe("corruptSentence", () => {
  it("introduces one learner mistake and reports the wrong word", () => {
    const result = corruptSentence("She doesn't like coffee in the morning.");
    assert.ok(result);
    assert.equal(result.wrongWord, "don't");
    assert.equal(result.rightWord, "doesn't");
    assert.ok(result.corrupted.includes("don't"));
    assert.notEqual(result.corrupted, "She doesn't like coffee in the morning.");
  });

  it("returns null when no corruption rule applies", () => {
    assert.equal(corruptSentence("Zebras gallop quickly."), null);
  });
});

describe("questionsFromTopic", () => {
  it("turns 'wrong => right' lines into correction and choose-correct questions", () => {
    const topic = makeTopic({
      commonMistakes: "He go to school => He goes to school\nShe don't know => She doesn't know",
    });
    const questions = questionsFromTopic(topic);
    const correction = questions.find((q) => q.type === "correct_sentence");
    const choose = questions.find((q) => q.type === "choose_correct");
    assert.ok(correction);
    assert.equal(correction.answer, "He goes to school");
    assert.ok(correction.context?.includes("He go to school"));
    assert.ok(choose);
    assert.equal(choose.answer, "She doesn't know");
    assert.ok(choose.options?.includes("She don't know"));
  });

  it("generates questions from example sentences via corruption", () => {
    const topic = makeTopic({
      examples: "She doesn't like coffee in the morning.\nThey were happy about the good news.",
    });
    const questions = questionsFromTopic(topic);
    assert.ok(questions.length >= 2);
    for (const q of questions) {
      assert.equal(q.grammarTopicId, topic.id);
      assert.ok(["choose_correct", "find_mistake"].includes(q.type));
    }
  });

  it("find-the-mistake questions include the wrong word among the options", () => {
    const topic = makeTopic({
      examples:
        "She doesn't like coffee in the morning.\nThey were happy about the good news yesterday.",
    });
    const questions = questionsFromTopic(topic);
    const findMistake = questions.find((q) => q.type === "find_mistake");
    assert.ok(findMistake, "expected at least one find_mistake question");
    assert.ok(findMistake.options);
    assert.ok(findMistake.options.includes(findMistake.answer));
    assert.ok(findMistake.explanation?.includes("Correct sentence"));
  });

  it("skips examples that cannot be corrupted", () => {
    const topic = makeTopic({ examples: "Zebras gallop very quickly indeed." });
    assert.equal(questionsFromTopic(topic).length, 0);
  });
});

describe("topic weakness", () => {
  it("gives unseen topics a moderate probe score", () => {
    assert.equal(topicWeakness("unknown", new Map()), 0.4);
    assert.equal(topicWeakness("unknown", undefined), 0.4);
  });

  it("scores wrong-heavy topics higher", () => {
    const stats: TopicStatsMap = new Map([
      ["weak", { wrong: 4, total: 5 }],
      ["strong", { wrong: 0, total: 5 }],
    ]);
    assert.ok(topicWeakness("weak", stats) > topicWeakness("strong", stats));
  });

  it("sorts topics weakest first", () => {
    const weak = makeTopic();
    const strong = makeTopic();
    const stats: TopicStatsMap = new Map([
      [weak.id, { wrong: 4, total: 5 }],
      [strong.id, { wrong: 0, total: 5 }],
    ]);
    const sorted = sortTopicsByWeakness([strong, weak], stats);
    assert.equal(sorted[0].id, weak.id);
  });
});

describe("buildGrammarQuiz", () => {
  it("fills the quiz to the requested size using the built-in bank", () => {
    const quiz = buildGrammarQuiz([], { size: 10 });
    assert.equal(quiz.length, 10);
  });

  it("includes questions from the user's weakest topic", () => {
    const weak = makeTopic({
      title: "Present simple",
      commonMistakes:
        "He go to school => He goes to school\nShe don't know => She doesn't know\nIt rain a lot => It rains a lot",
      examples: "She doesn't like coffee in the morning.",
    });
    const strong = makeTopic({ title: "Articles", commonMistakes: "a apple => an apple" });
    const stats: TopicStatsMap = new Map([
      [weak.id, { wrong: 5, total: 6 }],
      [strong.id, { wrong: 0, total: 6 }],
    ]);
    const quiz = buildGrammarQuiz([strong, weak], { size: 12, topicStats: stats });
    const weakQuestions = quiz.filter((q) => q.grammarTopicId === weak.id);
    assert.ok(weakQuestions.length >= 2, `expected ≥2 weak-topic questions, got ${weakQuestions.length}`);
  });
});
