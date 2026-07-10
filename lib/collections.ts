// Study Collections: group the user's cards into ready-made study sets — by
// status (due / weak / recent mistakes / mastered), by difficult phrases, and
// automatically by tag, category and difficulty.
//
// Pure module (no DB access) so it can be unit-tested. The collections page
// fetches the user-scoped cards + recent-mistake counts and calls these; the
// filtering only ever returns cards from the array it's given, so it can never
// leak another user's data.

import {
  getReviewPriority,
  isMasteredCard,
  isWeakCard,
  type RecentMistakeCounts,
} from "./review";
import type { AnalyzableCard } from "./analytics";

export type CollectionKind =
  | "due"
  | "weak"
  | "mistakes"
  | "difficult-phrases"
  | "mastered"
  | "tag"
  | "category"
  | "difficulty"
  | "grammar";

export interface StudyCollection {
  /** Stable id, e.g. "due", "weak", "tag:travel", "category:work", "difficulty:hard". */
  id: string;
  kind: CollectionKind;
  title: string;
  description: string;
  count: number;
  dueCount: number;
  weakCount: number;
  /** Tag / category / difficulty value for the auto-generated collections. */
  value?: string;
  lastStudied: Date | null;
  /** Higher sorts first in the grid. */
  priority: number;
}

export interface CollectionAction {
  label: string;
  href: string;
  variant: "primary" | "ghost";
}

export interface CollectionOptions {
  now?: Date;
  recentMistakes?: RecentMistakeCounts;
  /** When > 0, a Grammar topics collection is included. */
  grammarTopicCount?: number;
}

const TAG_MIN_CARDS = 2; // don't make a collection for a one-off tag
const MAX_TAG_COLLECTIONS = 24;

function cardTags(card: { tags: string }): string[] {
  return card.tags.split(",").map((t) => t.trim()).filter(Boolean);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function lastStudiedOf(list: AnalyzableCard[]): Date | null {
  const times = list
    .map((c) => c.lastReviewedAt)
    .filter((d): d is Date => d != null)
    .map((d) => d.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

/**
 * Builds the study collections for a set of (already user-scoped) cards.
 * Status collections come first, then difficult phrases and mastered cards,
 * then auto-generated tag / category / difficulty sets.
 */
export function getStudyCollections(
  cards: AnalyzableCard[],
  options: CollectionOptions = {}
): StudyCollection[] {
  const { now = new Date(), recentMistakes = new Map(), grammarTopicCount = 0 } = options;
  const isDue = (c: AnalyzableCard) => c.dueDate.getTime() <= now.getTime();
  const weakIn = (list: AnalyzableCard[]) => list.filter(isWeakCard).length;
  const dueIn = (list: AnalyzableCard[]) => list.filter(isDue).length;

  const build = (
    id: string,
    kind: CollectionKind,
    title: string,
    description: string,
    list: AnalyzableCard[],
    priority: number,
    value?: string
  ): StudyCollection => ({
    id,
    kind,
    title,
    description,
    value,
    count: list.length,
    dueCount: dueIn(list),
    weakCount: weakIn(list),
    lastStudied: lastStudiedOf(list),
    priority,
  });

  const collections: StudyCollection[] = [];

  const dueCards = cards.filter(isDue);
  if (dueCards.length) {
    collections.push(build("due", "due", "Due today", "Cards scheduled for review today.", dueCards, 100));
  }

  const weakCards = cards.filter(isWeakCard);
  if (weakCards.length) {
    collections.push(
      build("weak", "weak", "Weak words", "Cards you keep getting wrong — extra practice fixes them fastest.", weakCards, 90)
    );
  }

  const mistakeCards = cards.filter((c) => (recentMistakes.get(c.id) ?? 0) > 0);
  if (mistakeCards.length) {
    collections.push(
      build("mistakes", "mistakes", "Recent mistakes", "Words missed in the last two weeks.", mistakeCards, 85)
    );
  }

  const difficultPhrases = cards.filter(
    (c) => c.kind === "phrase" && (isWeakCard(c) || c.difficulty === "hard")
  );
  if (difficultPhrases.length) {
    collections.push(
      build(
        "difficult-phrases",
        "difficult-phrases",
        "Difficult phrases",
        "Multi-word phrases that are hard or often wrong — great for writing practice.",
        difficultPhrases,
        70
      )
    );
  }

  const masteredCards = cards.filter(isMasteredCard);
  if (masteredCards.length) {
    collections.push(
      build("mastered", "mastered", "Mastered cards", "Cards you've locked in. Revisit occasionally to keep them.", masteredCards, 30)
    );
  }

  if (grammarTopicCount > 0) {
    collections.push({
      id: "grammar",
      kind: "grammar",
      title: "Grammar topics",
      description: "Your saved grammar topics and the adaptive question pool.",
      count: grammarTopicCount,
      dueCount: 0,
      weakCount: 0,
      lastStudied: null,
      priority: 40,
    });
  }

  // Auto: tags (only tags shared by a few cards, worst first).
  const byTag = new Map<string, AnalyzableCard[]>();
  for (const card of cards) {
    for (const tag of cardTags(card)) {
      const key = tag.toLowerCase();
      const list = byTag.get(key) ?? [];
      list.push(card);
      byTag.set(key, list);
    }
  }
  [...byTag.entries()]
    .filter(([, list]) => list.length >= TAG_MIN_CARDS)
    .sort((a, b) => weakIn(b[1]) - weakIn(a[1]) || b[1].length - a[1].length)
    .slice(0, MAX_TAG_COLLECTIONS)
    .forEach(([tag, list]) => {
      collections.push(
        build(`tag:${tag}`, "tag", titleCase(tag), `Cards tagged “${tag}”.`, list, 50, tag)
      );
    });

  // Auto: categories.
  const byCategory = new Map<string, AnalyzableCard[]>();
  for (const card of cards) {
    const cat = card.category?.trim();
    if (!cat) continue;
    const list = byCategory.get(cat) ?? [];
    list.push(card);
    byCategory.set(cat, list);
  }
  [...byCategory.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([cat, list]) => {
      collections.push(
        build(`category:${cat.toLowerCase()}`, "category", titleCase(cat), `Cards in “${cat}”.`, list, 45, cat)
      );
    });

  // Auto: difficulty buckets.
  for (const d of ["hard", "medium", "easy"] as const) {
    const list = cards.filter((c) => c.difficulty === d);
    if (list.length) {
      collections.push(
        build(`difficulty:${d}`, "difficulty", `${titleCase(d)} cards`, `All ${d} cards.`, list, 20, d)
      );
    }
  }

  return collections.sort((a, b) => b.priority - a.priority || b.count - a.count);
}

/**
 * Returns the cards belonging to a collection, most-needed first. Only ever
 * returns cards from the given (user-scoped) array — ownership-safe by
 * construction.
 */
export function getCollectionCards<T extends AnalyzableCard>(
  cards: T[],
  collectionId: string,
  options: CollectionOptions = {}
): T[] {
  const { now = new Date(), recentMistakes = new Map() } = options;
  const isDue = (c: T) => c.dueDate.getTime() <= now.getTime();

  let list: T[];
  if (collectionId === "due") list = cards.filter(isDue);
  else if (collectionId === "weak") list = cards.filter(isWeakCard);
  else if (collectionId === "mistakes") list = cards.filter((c) => (recentMistakes.get(c.id) ?? 0) > 0);
  else if (collectionId === "difficult-phrases")
    list = cards.filter((c) => c.kind === "phrase" && (isWeakCard(c) || c.difficulty === "hard"));
  else if (collectionId === "mastered") list = cards.filter(isMasteredCard);
  else if (collectionId.startsWith("tag:")) {
    const v = collectionId.slice(4).toLowerCase();
    list = cards.filter((c) => cardTags(c).map((t) => t.toLowerCase()).includes(v));
  } else if (collectionId.startsWith("category:")) {
    const v = collectionId.slice("category:".length).toLowerCase();
    list = cards.filter((c) => (c.category ?? "").trim().toLowerCase() === v);
  } else if (collectionId.startsWith("difficulty:")) {
    const v = collectionId.slice("difficulty:".length);
    list = cards.filter((c) => c.difficulty === v);
  } else {
    list = [];
  }

  return [...list].sort(
    (a, b) =>
      getReviewPriority(b, now, recentMistakes.get(b.id) ?? 0) -
      getReviewPriority(a, now, recentMistakes.get(a.id) ?? 0)
  );
}

/** The Review / Quiz / Writing / Open-list actions offered for a collection. */
export function getCollectionActions(collection: StudyCollection): CollectionAction[] {
  const value = encodeURIComponent(collection.value ?? "");
  switch (collection.kind) {
    case "due":
      return [
        { label: "Review", href: "/review", variant: "primary" },
        { label: "Quiz", href: "/quiz/vocab", variant: "ghost" },
        { label: "Writing", href: "/writing?mode=due", variant: "ghost" },
        { label: "Open list", href: "/cards?status=due", variant: "ghost" },
      ];
    case "weak":
      return [
        { label: "Review", href: "/review?mode=weak", variant: "primary" },
        { label: "Quiz", href: "/quiz/vocab?mode=weak", variant: "ghost" },
        { label: "Writing", href: "/writing?mode=weak", variant: "ghost" },
        { label: "Open list", href: "/cards?status=weak", variant: "ghost" },
      ];
    case "mistakes":
      return [
        { label: "Review", href: "/review?mode=mistakes", variant: "primary" },
        { label: "Quiz", href: "/quiz/vocab?mode=mistakes", variant: "ghost" },
        { label: "Writing", href: "/writing?mode=mistakes", variant: "ghost" },
        { label: "Mistake Bank", href: "/mistakes", variant: "ghost" },
      ];
    case "difficult-phrases":
      return [
        { label: "Writing", href: "/writing?mode=phrases", variant: "primary" },
        { label: "Review", href: "/review?mode=weak", variant: "ghost" },
        { label: "Open list", href: "/cards?kind=phrase&difficulty=hard", variant: "ghost" },
      ];
    case "mastered":
      return [
        { label: "Quiz", href: "/quiz/vocab", variant: "primary" },
        { label: "Review ahead", href: "/review?ahead=1", variant: "ghost" },
        { label: "Open list", href: "/cards", variant: "ghost" },
      ];
    case "tag":
      return [
        { label: "Review", href: `/review?tag=${value}`, variant: "primary" },
        { label: "Quiz", href: `/quiz/vocab?tag=${value}`, variant: "ghost" },
        { label: "Writing", href: `/writing?mode=tag&tag=${value}`, variant: "ghost" },
        { label: "Open list", href: `/cards?tag=${value}`, variant: "ghost" },
      ];
    case "category":
      return [
        { label: "Open list", href: `/cards?q=${value}`, variant: "primary" },
        { label: "Quiz", href: "/quiz/vocab", variant: "ghost" },
      ];
    case "difficulty":
      return [
        { label: "Open list", href: `/cards?difficulty=${value}`, variant: "primary" },
        { label: "Quiz", href: "/quiz/vocab", variant: "ghost" },
      ];
    case "grammar":
      return [
        { label: "Grammar quiz", href: "/quiz/grammar", variant: "primary" },
        { label: "Open topics", href: "/grammar", variant: "ghost" },
      ];
  }
}
