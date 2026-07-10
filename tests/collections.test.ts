// Tests for Study Collections (lib/collections.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCollectionActions,
  getCollectionCards,
  getStudyCollections,
  type StudyCollection,
} from "../lib/collections";
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

function byId(collections: StudyCollection[], id: string) {
  return collections.find((c) => c.id === id);
}

describe("getStudyCollections", () => {
  it("creates a Due today collection with due cards", () => {
    const due = makeCard({ dueDate: daysAgo(1) });
    const future = makeCard({ dueDate: daysAgo(-5) });
    const cols = getStudyCollections([due, future], { now: NOW });
    const dueCol = byId(cols, "due");
    assert.ok(dueCol);
    assert.equal(dueCol.count, 1);
    assert.equal(dueCol.kind, "due");
  });

  it("creates a Weak words collection from struggling cards", () => {
    const weak = makeCard({ lapses: 3 });
    const strong = makeCard({ reviewCount: 5, correctCount: 5 });
    const cols = getStudyCollections([weak, strong], { now: NOW });
    const weakCol = byId(cols, "weak");
    assert.ok(weakCol);
    assert.equal(weakCol.count, 1);
    assert.equal(weakCol.weakCount, 1);
  });

  it("creates a Recent mistakes collection from recently-missed cards", () => {
    const missed = makeCard();
    const fine = makeCard();
    const cols = getStudyCollections([missed, fine], {
      now: NOW,
      recentMistakes: new Map([[missed.id, 2]]),
    });
    const col = byId(cols, "mistakes");
    assert.ok(col);
    assert.equal(col.count, 1);
  });

  it("creates a Difficult phrases collection from hard/weak phrases", () => {
    const hardPhrase = makeCard({ kind: "phrase", difficulty: "hard", text: "cut corners" });
    const easyWord = makeCard({ kind: "word", difficulty: "easy" });
    const cols = getStudyCollections([hardPhrase, easyWord], { now: NOW });
    const col = byId(cols, "difficult-phrases");
    assert.ok(col);
    assert.equal(col.count, 1);
  });

  it("auto-generates a tag collection for tags shared by 2+ cards", () => {
    const a = makeCard({ tags: "travel, verbs" });
    const b = makeCard({ tags: "travel" });
    const lonely = makeCard({ tags: "solo" }); // only one card → no collection
    const cols = getStudyCollections([a, b, lonely], { now: NOW });
    const travel = byId(cols, "tag:travel");
    assert.ok(travel);
    assert.equal(travel.count, 2);
    assert.equal(byId(cols, "tag:solo"), undefined);
  });

  it("auto-generates a category collection", () => {
    const a = makeCard({ category: "Work" });
    const b = makeCard({ category: "Work" });
    const cols = getStudyCollections([a, b], { now: NOW });
    const col = byId(cols, "category:work");
    assert.ok(col);
    assert.equal(col.count, 2);
    assert.equal(col.value, "Work");
  });

  it("includes a Grammar topics collection only when topics exist", () => {
    const withGrammar = getStudyCollections([makeCard()], { now: NOW, grammarTopicCount: 3 });
    assert.ok(byId(withGrammar, "grammar"));
    const without = getStudyCollections([makeCard()], { now: NOW, grammarTopicCount: 0 });
    assert.equal(byId(without, "grammar"), undefined);
  });
});

describe("getCollectionCards", () => {
  it("returns the due cards for the due collection, most-needed first", () => {
    const due1 = makeCard({ dueDate: daysAgo(5) }); // more overdue
    const due2 = makeCard({ dueDate: daysAgo(1) });
    const future = makeCard({ dueDate: daysAgo(-3) });
    const list = getCollectionCards([future, due2, due1], "due", { now: NOW });
    assert.deepEqual(list.map((c) => c.id), [due1.id, due2.id]);
  });

  it("filters by tag (case-insensitive)", () => {
    const travel = makeCard({ tags: "Travel" });
    const work = makeCard({ tags: "work" });
    const list = getCollectionCards([travel, work], "tag:travel", { now: NOW });
    assert.deepEqual(list.map((c) => c.id), [travel.id]);
  });

  it("filters by category", () => {
    const work = makeCard({ category: "Work" });
    const home = makeCard({ category: "Home" });
    const list = getCollectionCards([work, home], "category:work", { now: NOW });
    assert.deepEqual(list.map((c) => c.id), [work.id]);
  });

  it("filters by difficulty", () => {
    const hard = makeCard({ difficulty: "hard" });
    const easy = makeCard({ difficulty: "easy" });
    const list = getCollectionCards([hard, easy], "difficulty:hard", { now: NOW });
    assert.deepEqual(list.map((c) => c.id), [hard.id]);
  });

  it("is ownership-safe: only ever returns cards from the given (scoped) array", () => {
    const mine = [
      makeCard({ tags: "shared", dueDate: daysAgo(1) }),
      makeCard({ tags: "shared", lapses: 3 }),
    ];
    const mineIds = new Set(mine.map((c) => c.id));
    for (const collectionId of ["due", "weak", "mistakes", "tag:shared", "mastered", "difficulty:medium"]) {
      const result = getCollectionCards(mine, collectionId, {
        now: NOW,
        recentMistakes: new Map([["someone-elses-card", 5]]),
      });
      for (const c of result) assert.ok(mineIds.has(c.id), `${collectionId} leaked a foreign card`);
    }
  });

  it("returns an empty list for an unknown collection id", () => {
    assert.deepEqual(getCollectionCards([makeCard()], "nope:123", { now: NOW }), []);
  });
});

describe("getCollectionActions", () => {
  it("offers tag-scoped review/quiz/writing links for a tag collection", () => {
    const col: StudyCollection = {
      id: "tag:travel",
      kind: "tag",
      title: "Travel",
      description: "",
      count: 3,
      dueCount: 0,
      weakCount: 0,
      value: "travel",
      lastStudied: null,
      priority: 50,
    };
    const actions = getCollectionActions(col);
    assert.ok(actions.some((a) => a.href === "/review?tag=travel"));
    assert.ok(actions.some((a) => a.href === "/quiz/vocab?tag=travel"));
    assert.ok(actions.some((a) => a.href === "/writing?mode=tag&tag=travel"));
    assert.ok(actions.some((a) => a.href === "/cards?tag=travel"));
  });

  it("offers status-scoped actions for the weak collection", () => {
    const col: StudyCollection = {
      id: "weak",
      kind: "weak",
      title: "Weak words",
      description: "",
      count: 5,
      dueCount: 0,
      weakCount: 5,
      lastStudied: null,
      priority: 90,
    };
    const actions = getCollectionActions(col);
    assert.ok(actions.some((a) => a.href === "/review?mode=weak"));
    assert.ok(actions.some((a) => a.href === "/writing?mode=weak"));
  });
});
