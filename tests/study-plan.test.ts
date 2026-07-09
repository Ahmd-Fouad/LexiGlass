// Tests for the Smart Daily Study Plan (lib/study-plan.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDailyPlanItems,
  isPlanDone,
  planMinutesLeft,
  type DailyPlanSnapshot,
} from "../lib/study-plan";

function makeSnapshot(overrides: Partial<DailyPlanSnapshot> = {}): DailyPlanSnapshot {
  return {
    totalCards: 20,
    grammarTopicCount: 2,
    dueCount: 0,
    weakCount: 0,
    recentMistakeCardCount: 0,
    mistakeCardsReviewedToday: 0,
    weakCardsReviewedToday: 0,
    reviewsToday: 0,
    startedVocabQuizToday: false,
    finishedVocabQuizToday: false,
    startedGrammarQuizToday: false,
    finishedGrammarQuizToday: false,
    weakestGrammarTopic: null,
    ...overrides,
  };
}

function find(items: ReturnType<typeof buildDailyPlanItems>, id: string) {
  return items.find((i) => i.id === id);
}

describe("buildDailyPlanItems", () => {
  it("creates a high-priority due-cards item with the count", () => {
    const items = buildDailyPlanItems(makeSnapshot({ dueCount: 12 }));
    const due = find(items, "due");
    assert.ok(due);
    assert.equal(due.title, "Review 12 due cards");
    assert.equal(due.count, 12);
    assert.equal(due.priority, "high");
    assert.equal(due.status, "not_started");
    assert.ok(due.minutes > 0);
    assert.equal(due.href, "/review");
  });

  it("marks the due item in progress once reviews happened today", () => {
    const items = buildDailyPlanItems(makeSnapshot({ dueCount: 5, reviewsToday: 3 }));
    assert.equal(find(items, "due")?.status, "in_progress");
  });

  it("marks the due item completed when nothing is due after reviewing", () => {
    const items = buildDailyPlanItems(makeSnapshot({ dueCount: 0, reviewsToday: 8 }));
    assert.equal(find(items, "due")?.status, "completed");
  });

  it("omits the due item when nothing is due and nothing was reviewed", () => {
    const items = buildDailyPlanItems(makeSnapshot({ dueCount: 0, reviewsToday: 0 }));
    assert.equal(find(items, "due"), undefined);
  });

  it("creates a mistake-repair item counting only unrepaired mistakes", () => {
    const items = buildDailyPlanItems(
      makeSnapshot({ recentMistakeCardCount: 4, mistakeCardsReviewedToday: 1 })
    );
    const m = find(items, "mistakes");
    assert.ok(m);
    assert.equal(m.count, 3);
    assert.equal(m.title, "Repair 3 recent mistakes");
    assert.equal(m.status, "in_progress");
    assert.equal(m.priority, "high"); // 3+ remaining
    assert.equal(m.href, "/review?mode=mistakes");
  });

  it("completes the mistake item when every missed card was reviewed today", () => {
    const items = buildDailyPlanItems(
      makeSnapshot({ recentMistakeCardCount: 2, mistakeCardsReviewedToday: 2 })
    );
    assert.equal(find(items, "mistakes")?.status, "completed");
  });

  it("creates a weak-words item and completes it after enough practice", () => {
    const fresh = buildDailyPlanItems(makeSnapshot({ weakCount: 12 }));
    const weak = find(fresh, "weak");
    assert.ok(weak);
    assert.equal(weak.count, 8); // capped for one session
    assert.equal(weak.status, "not_started");
    assert.equal(weak.href, "/review?mode=weak");

    const done = buildDailyPlanItems(makeSnapshot({ weakCount: 12, weakCardsReviewedToday: 5 }));
    assert.equal(find(done, "weak")?.status, "completed");
  });

  it("only offers a vocab quiz when there are enough cards", () => {
    assert.equal(find(buildDailyPlanItems(makeSnapshot({ totalCards: 2 })), "vocab-quiz"), undefined);
    assert.ok(find(buildDailyPlanItems(makeSnapshot({ totalCards: 10 })), "vocab-quiz"));
  });

  it("tracks vocab quiz progress from today's sessions", () => {
    const started = buildDailyPlanItems(makeSnapshot({ startedVocabQuizToday: true }));
    assert.equal(find(started, "vocab-quiz")?.status, "in_progress");
    const finished = buildDailyPlanItems(
      makeSnapshot({ startedVocabQuizToday: true, finishedVocabQuizToday: true })
    );
    assert.equal(find(finished, "vocab-quiz")?.status, "completed");
  });

  it("aims the grammar quiz at the weakest topic when one exists", () => {
    const items = buildDailyPlanItems(
      makeSnapshot({ weakestGrammarTopic: { id: "t1", title: "Past simple" } })
    );
    const g = find(items, "grammar-quiz");
    assert.ok(g);
    assert.equal(g.title, "Grammar quiz: Past simple");
    assert.ok(g.reason.includes("Past simple"));
    assert.equal(g.priority, "medium");

    const generic = find(buildDailyPlanItems(makeSnapshot()), "grammar-quiz");
    assert.equal(generic?.title, "Take a grammar quiz");
    assert.equal(generic?.priority, "low");
  });

  it("puts active high-priority tasks first and completed tasks last", () => {
    const items = buildDailyPlanItems(
      makeSnapshot({
        dueCount: 10,
        recentMistakeCardCount: 3,
        mistakeCardsReviewedToday: 3, // completed
        weakCount: 4,
      })
    );
    assert.equal(items[0].id, "due"); // active high priority first
    assert.equal(items[items.length - 1].status, "completed");
  });
});

describe("plan helpers", () => {
  it("isPlanDone is true only when every item is completed", () => {
    const busy = buildDailyPlanItems(makeSnapshot({ dueCount: 3 }));
    assert.equal(isPlanDone(busy), false);

    const done = buildDailyPlanItems(
      makeSnapshot({
        dueCount: 0,
        reviewsToday: 5,
        recentMistakeCardCount: 2,
        mistakeCardsReviewedToday: 2,
        weakCount: 2,
        weakCardsReviewedToday: 2,
        startedVocabQuizToday: true,
        finishedVocabQuizToday: true,
        startedGrammarQuizToday: true,
        finishedGrammarQuizToday: true,
      })
    );
    assert.equal(isPlanDone(done), true);
  });

  it("planMinutesLeft sums only unfinished tasks", () => {
    const items = buildDailyPlanItems(
      makeSnapshot({ dueCount: 4, startedVocabQuizToday: true, finishedVocabQuizToday: true })
    );
    const expected = items
      .filter((i) => i.status !== "completed")
      .reduce((sum, i) => sum + i.minutes, 0);
    assert.equal(planMinutesLeft(items), expected);
    assert.ok(expected > 0);
  });
});
