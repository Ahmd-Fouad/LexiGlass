// Tests for Mistake Bank aggregation and weakness analytics (lib/analytics.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accuracyByDifficulty,
  accuracyByQuestionType,
  buildGrammarMistakes,
  buildVocabMistakes,
  classifyCards,
  dueBuckets,
  mostRepeatedMistakes,
  weakestTags,
  type AnalyzableCard,
  type QuizAnswerRow,
  type ReviewLogRow,
  type TopicRow,
} from "../lib/analytics";

const NOW = new Date("2026-07-09T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS);
}

let seq = 0;
function makeCard(overrides: Partial<AnalyzableCard> = {}): AnalyzableCard {
  const id = `card_${++seq}`;
  return {
    id,
    text: `word ${id}`,
    kind: "word",
    meaning: `meaning of ${id}`,
    example: null,
    translation: null,
    tags: "",
    category: null,
    difficulty: "medium",
    intervalDays: 1,
    dueDate: daysAgo(0),
    reviewCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    lapses: 0,
    lastReviewedAt: null,
    createdAt: daysAgo(20),
    ...overrides,
  };
}

function makeLog(flashcardId: string, rating: string, days: number): ReviewLogRow {
  return { flashcardId, rating, reviewedAt: daysAgo(days) };
}

function makeAnswer(overrides: Partial<QuizAnswerRow> = {}): QuizAnswerRow {
  return {
    flashcardId: null,
    grammarTopicId: null,
    questionType: "mcq_meaning",
    question: "What does it mean?",
    correctAnswer: "the right one",
    userAnswer: "the wrong one",
    isCorrect: false,
    createdAt: daysAgo(1),
    ...overrides,
  };
}

function makeTopic(overrides: Partial<TopicRow> = {}): TopicRow {
  const id = `topic_${++seq}`;
  return { id, title: `Topic ${id}`, difficulty: "medium", tags: "", ...overrides };
}

describe("buildVocabMistakes", () => {
  it("collects recent quiz mistakes and review lapses for a card", () => {
    const card = makeCard({ reviewCount: 4, correctCount: 2 });
    // A wrong quiz answer writes both a QuizAnswer and an "again" ReviewLog,
    // so this data is one quiz miss (answer + its log) plus one review "hard".
    const logs = [makeLog(card.id, "again", 1), makeLog(card.id, "hard", 5)];
    const answers = [makeAnswer({ flashcardId: card.id, createdAt: daysAgo(1) })];

    const [item] = buildVocabMistakes([card], logs, answers, { now: NOW });
    assert.ok(item);
    assert.equal(item.mistakeCount, 2); // quiz miss counted once + hard rating
    assert.deepEqual(item.sources.sort(), ["quiz", "review"]);
    assert.equal(item.isRecent, true);
    assert.equal(item.accuracy, 50);
    assert.ok(item.lastWrongAnswer);
    assert.equal(item.lastWrongAnswer.userAnswer, "the wrong one");
    assert.equal(item.lastMistakeAt?.getTime(), daysAgo(1).getTime());
  });

  it("does not double-count a quiz miss and the again-log it creates", () => {
    const card = makeCard({ reviewCount: 2, correctCount: 1 });
    // One wrong quiz answer + its auto-created "again" log = ONE miss.
    const logs = [makeLog(card.id, "again", 1)];
    const answers = [makeAnswer({ flashcardId: card.id, createdAt: daysAgo(1) })];

    const [item] = buildVocabMistakes([card], logs, answers, { now: NOW });
    assert.ok(item);
    assert.equal(item.mistakeCount, 1);
    assert.deepEqual(item.sources, ["quiz"]); // no review-only misses
  });

  it("excludes cards with a clean record", () => {
    const clean = makeCard({ reviewCount: 5, correctCount: 5 });
    assert.equal(buildVocabMistakes([clean], [], [], { now: NOW }).length, 0);
  });

  it("includes long-term weak cards even without recent misses", () => {
    const weak = makeCard({ lapses: 3, reviewCount: 6, correctCount: 3 });
    const [item] = buildVocabMistakes([weak], [], [], { now: NOW });
    assert.ok(item);
    assert.equal(item.isRecent, false);
    assert.equal(item.mistakeCount, 0);
    assert.equal(item.isDifficult, true); // 3+ lapses
  });

  it("ignores misses outside the window for counting", () => {
    // Old wrong answer only: doesn't qualify an otherwise-clean card.
    const card = makeCard({ reviewCount: 4, correctCount: 4 });
    const oldAnswer = makeAnswer({ flashcardId: card.id, createdAt: daysAgo(30) });
    assert.equal(buildVocabMistakes([card], [], [oldAnswer], { now: NOW }).length, 0);

    // Old ratings don't count either.
    const logs = [makeLog(card.id, "again", 30)];
    assert.equal(buildVocabMistakes([card], logs, [], { now: NOW }).length, 0);
  });

  it("sorts by priority, worst first", () => {
    const worse = makeCard({ lapses: 4, reviewCount: 8, correctCount: 3 });
    const milder = makeCard({ lapses: 2, reviewCount: 8, correctCount: 6 });
    const items = buildVocabMistakes([milder, worse], [makeLog(worse.id, "again", 1)], [], { now: NOW });
    assert.deepEqual(items.map((i) => i.id), [worse.id, milder.id]);
  });
});

describe("buildGrammarMistakes", () => {
  it("aggregates wrong answers per topic with accuracy", () => {
    const topic = makeTopic({ title: "Present simple" });
    const answers = [
      makeAnswer({ grammarTopicId: topic.id, isCorrect: false, createdAt: daysAgo(2) }),
      makeAnswer({ grammarTopicId: topic.id, isCorrect: false, createdAt: daysAgo(1), userAnswer: "latest wrong" }),
      makeAnswer({ grammarTopicId: topic.id, isCorrect: true }),
      makeAnswer({ grammarTopicId: topic.id, isCorrect: true }),
    ];
    const [item] = buildGrammarMistakes([topic], answers, { now: NOW });
    assert.ok(item);
    assert.equal(item.wrong, 2);
    assert.equal(item.total, 4);
    assert.equal(item.accuracy, 50);
    assert.equal(item.isRecent, true);
    assert.equal(item.lastWrongAnswer?.userAnswer, "latest wrong");
  });

  it("skips topics the user never got wrong", () => {
    const topic = makeTopic();
    const answers = [makeAnswer({ grammarTopicId: topic.id, isCorrect: true })];
    assert.equal(buildGrammarMistakes([topic], answers, { now: NOW }).length, 0);
  });

  it("sorts weakest topics first", () => {
    const bad = makeTopic();
    const okay = makeTopic();
    const answers = [
      makeAnswer({ grammarTopicId: bad.id, isCorrect: false }),
      makeAnswer({ grammarTopicId: bad.id, isCorrect: false }),
      makeAnswer({ grammarTopicId: bad.id, isCorrect: true }),
      makeAnswer({ grammarTopicId: okay.id, isCorrect: false, createdAt: daysAgo(30) }),
      makeAnswer({ grammarTopicId: okay.id, isCorrect: true }),
      makeAnswer({ grammarTopicId: okay.id, isCorrect: true }),
      makeAnswer({ grammarTopicId: okay.id, isCorrect: true }),
    ];
    const items = buildGrammarMistakes([okay, bad], answers, { now: NOW });
    assert.deepEqual(items.map((i) => i.id), [bad.id, okay.id]);
  });
});

describe("mostRepeatedMistakes", () => {
  it("keeps items failed 2+ times, worst first, capped at the limit", () => {
    const cardA = makeCard({ lapses: 5, reviewCount: 8, correctCount: 3 });
    const cardB = makeCard({ lapses: 2, reviewCount: 6, correctCount: 4 });
    const single = makeCard({ difficulty: "hard", lapses: 1 });
    const topic = makeTopic();

    const vocab = buildVocabMistakes([cardA, cardB, single], [], [], { now: NOW });
    const grammar = buildGrammarMistakes(
      [topic],
      [
        makeAnswer({ grammarTopicId: topic.id, isCorrect: false }),
        makeAnswer({ grammarTopicId: topic.id, isCorrect: false }),
        makeAnswer({ grammarTopicId: topic.id, isCorrect: false }),
        makeAnswer({ grammarTopicId: topic.id, isCorrect: true }),
      ],
      { now: NOW }
    );

    const repeated = mostRepeatedMistakes(vocab, grammar, 10);
    assert.equal(repeated[0].id, cardA.id); // 5 fails beats 3 and 2
    assert.ok(repeated.some((r) => r.id === topic.id));
    assert.ok(!repeated.some((r) => r.id === single.id)); // only 1 fail

    assert.equal(mostRepeatedMistakes(vocab, grammar, 1).length, 1);
  });
});

describe("weakestTags", () => {
  it("groups accuracy and recent mistakes by tag, weakest first", () => {
    const travel1 = makeCard({ tags: "travel", reviewCount: 5, correctCount: 2, lapses: 2 });
    const travel2 = makeCard({ tags: "Travel, verbs", reviewCount: 5, correctCount: 3 });
    const work = makeCard({ tags: "work", reviewCount: 10, correctCount: 9 });
    const untagged = makeCard({ reviewCount: 4, correctCount: 1 });
    const cards = [travel1, travel2, work, untagged];

    const mistakes = buildVocabMistakes(cards, [makeLog(travel1.id, "again", 1)], [], { now: NOW });
    const tags = weakestTags(cards, mistakes);

    const travel = tags.find((t) => t.tag === "travel");
    assert.ok(travel);
    assert.equal(travel.cards, 2); // case-insensitive grouping
    assert.equal(travel.accuracy, 50); // (2+3)/(5+5)
    assert.equal(travel.mistakes, 1);
    assert.equal(tags[0].tag, "travel"); // most mistakes first
    assert.ok(!tags.some((t) => t.tag === ""));
  });
});

describe("accuracy buckets", () => {
  it("accuracyByDifficulty aggregates card counters per difficulty", () => {
    const cards = [
      makeCard({ difficulty: "easy", reviewCount: 10, correctCount: 9 }),
      makeCard({ difficulty: "hard", reviewCount: 10, correctCount: 4 }),
      makeCard({ difficulty: "hard", reviewCount: 10, correctCount: 6 }),
    ];
    const buckets = accuracyByDifficulty(cards);
    assert.deepEqual(buckets.map((b) => b.label), ["easy", "medium", "hard"]);
    assert.equal(buckets[0].accuracy, 90);
    assert.equal(buckets[2].accuracy, 50); // (4+6)/20
  });

  it("accuracyByQuestionType groups answers, most-answered first", () => {
    const answers = [
      makeAnswer({ questionType: "mcq_meaning", isCorrect: true }),
      makeAnswer({ questionType: "mcq_meaning", isCorrect: false }),
      makeAnswer({ questionType: "mcq_meaning", isCorrect: true }),
      makeAnswer({ questionType: "fill_blank", isCorrect: false }),
    ];
    const buckets = accuracyByQuestionType(answers);
    assert.equal(buckets[0].label, "Meaning choice");
    assert.equal(buckets[0].total, 3);
    assert.equal(buckets[0].accuracy, 67);
    assert.equal(buckets[1].label, "Fill in the blank");
    assert.equal(buckets[1].accuracy, 0);
  });
});

describe("classifyCards", () => {
  it("splits cards into mutually exclusive states", () => {
    const cards = [
      makeCard({ reviewCount: 5, correctCount: 5, intervalDays: 6 }), // mastered
      makeCard({ lapses: 3 }), // weak
      makeCard({ reviewCount: 0 }), // new
      makeCard({ reviewCount: 2, correctCount: 2, intervalDays: 1 }), // learning
    ];
    const states = classifyCards(cards);
    assert.deepEqual(states, { mastered: 1, weak: 1, new: 1, learning: 1 });
  });
});

describe("dueBuckets", () => {
  it("buckets cards into today / tomorrow / this week", () => {
    const cards = [
      makeCard({ dueDate: daysAgo(3) }), // overdue → today
      makeCard({ dueDate: new Date(NOW.getTime() + 2 * 60 * 60 * 1000) }), // later today
      makeCard({ dueDate: new Date(NOW.getTime() + DAY_MS) }), // tomorrow
      makeCard({ dueDate: new Date(NOW.getTime() + 4 * DAY_MS) }), // this week
      makeCard({ dueDate: new Date(NOW.getTime() + 12 * DAY_MS) }), // beyond
    ];
    const buckets = dueBuckets(cards, NOW);
    assert.equal(buckets.today, 2);
    assert.equal(buckets.tomorrow, 1);
    assert.equal(buckets.thisWeek, 1);
  });
});
