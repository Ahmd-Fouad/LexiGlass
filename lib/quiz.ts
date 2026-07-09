import type { Flashcard } from "@prisma/client";
import type { QuizQuestion, VocabQuestionType, VocabQuizMode } from "./types";
import { isMasteredCard, isWeakCard, type RecentMistakeCounts } from "./review";

export const QUIZ_SIZE = 20;
export const MIN_CARDS_FOR_QUIZ = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface QuizSelectionOptions {
  size?: number;
  now?: Date;
  mode?: VocabQuizMode;
  /** Recent wrong quiz answers / "Again" ratings per card id (for scoring + "mistakes" mode). */
  recentMistakes?: RecentMistakeCounts;
  /** Required for mode "tag". */
  tag?: string | null;
}

/**
 * Picks the cards for a vocabulary quiz, prioritising (in this order of weight):
 *  1. cards due today (more overdue = higher priority)
 *  2. recent mistakes and cards answered wrong before (lapses / incorrect answers)
 *  3. difficult cards
 *  4. cards not reviewed for the longest time
 * Mastered cards are pushed down so the quiz spends time where it helps.
 * Modes narrow the pool: "weak" → struggling cards, "mistakes" → recently
 * wrong cards, "tag" → cards carrying the tag.
 */
export function selectQuizCards(cards: Flashcard[], options: QuizSelectionOptions = {}): Flashcard[] {
  const { size = QUIZ_SIZE, now = new Date(), mode = "standard", recentMistakes = new Map(), tag } = options;

  let pool = cards;
  if (mode === "weak") {
    pool = cards.filter(isWeakCard);
  } else if (mode === "mistakes") {
    pool = cards.filter((c) => (recentMistakes.get(c.id) ?? 0) > 0);
  } else if (mode === "tag" && tag) {
    const wanted = tag.trim().toLowerCase();
    pool = cards.filter((c) =>
      c.tags.split(",").map((t) => t.trim().toLowerCase()).includes(wanted)
    );
  }

  const scored = pool.map((card) => {
    const overdueDays = Math.max(0, (now.getTime() - card.dueDate.getTime()) / DAY_MS);
    const isDue = card.dueDate.getTime() <= now.getTime();
    const daysSinceReview = card.lastReviewedAt
      ? (now.getTime() - card.lastReviewedAt.getTime()) / DAY_MS
      : (now.getTime() - card.createdAt.getTime()) / DAY_MS + 2; // never reviewed → slightly boosted
    const difficultyBoost = card.difficulty === "hard" ? 10 : card.difficulty === "medium" ? 3 : 0;
    const accuracy = card.reviewCount > 0 ? card.correctCount / card.reviewCount : 1;

    const score =
      (isDue ? 100 + overdueDays * 2 : 0) +
      Math.min(recentMistakes.get(card.id) ?? 0, 5) * 10 +
      card.lapses * 6 +
      card.incorrectCount * 3 +
      (card.reviewCount >= 3 ? (1 - accuracy) * 15 : 0) +
      difficultyBoost +
      Math.min(daysSinceReview, 30) -
      (isMasteredCard(card) ? 40 : 0);

    // Small jitter so equal-score cards get shuffled between quizzes.
    return { card, score: score + Math.random() * 2 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, size).map((s) => s.card);
}

/**
 * Builds a mixed-type question for each selected card, using the other cards
 * as distractors. True/false stays rare (~1 in 6) because it's easy to guess;
 * fill-in-the-blank is only used when the example contains the exact target.
 */
export function buildVocabQuestions(selected: Flashcard[], pool: Flashcard[]): QuizQuestion[] {
  const types: VocabQuestionType[] = [
    "mcq_meaning",
    "mcq_word",
    "fill_blank",
    "mcq_meaning",
    "mcq_word",
    "true_false",
  ];

  return selected.map((card, i) => {
    let type = types[i % types.length];
    // fill_blank needs an example sentence that actually contains the word/phrase.
    if (type === "fill_blank" && !exampleContainsText(card)) {
      type = i % 2 === 0 ? "mcq_meaning" : "mcq_word";
    }
    return buildQuestion(card, type, pool, i);
  });
}

function buildQuestion(card: Flashcard, type: VocabQuestionType, pool: Flashcard[], index: number): QuizQuestion {
  const others = pool.filter((c) => c.id !== card.id);
  const id = `q${index}_${card.id}`;
  const kind = card.kind === "phrase" ? "phrase" : "word";
  const tags = card.tags.split(",").map((t) => t.trim()).filter(Boolean);

  switch (type) {
    case "mcq_meaning": {
      const distractors = pickDistractors(card, others, 3, (c) => c.meaning, card.meaning);
      return {
        id,
        flashcardId: card.id,
        type,
        kind,
        tags,
        prompt: `What does “${card.text}” mean?`,
        context: card.wordType ? `(${card.wordType})` : undefined,
        options: shuffle([card.meaning, ...distractors]),
        answer: card.meaning,
        explanation: card.example ? `Example: ${card.example}` : undefined,
      };
    }
    case "mcq_word": {
      const distractors = pickDistractors(card, others, 3, (c) => c.text, card.text);
      return {
        id,
        flashcardId: card.id,
        type,
        kind,
        tags,
        prompt: `Which word or phrase means: “${card.meaning}”?`,
        options: shuffle([card.text, ...distractors]),
        answer: card.text,
        explanation: card.example ? `Example: ${card.example}` : undefined,
      };
    }
    case "fill_blank": {
      const blanked = blankOutText(card.example ?? "", card.text);
      return {
        id,
        flashcardId: card.id,
        type,
        kind,
        tags,
        prompt: kind === "phrase" ? "Type the missing phrase:" : "Type the missing word:",
        context: blanked,
        answer: card.text,
        explanation: `Meaning: ${card.meaning}`,
      };
    }
    case "true_false": {
      const useReal = Math.random() < 0.5 || others.length === 0;
      const shownMeaning = useReal ? card.meaning : pickNearMeaning(card, others);
      return {
        id,
        flashcardId: card.id,
        type,
        kind,
        tags,
        prompt: `Does “${card.text}” mean: “${shownMeaning}”?`,
        options: ["True", "False"],
        answer: useReal ? "True" : "False",
        explanation: useReal ? undefined : `“${card.text}” actually means: ${card.meaning}`,
      };
    }
  }
}

/**
 * Picks distractor values for an MCQ, preferring cards that resemble the
 * target (same kind, same word type, same difficulty, shared tags) so the
 * wrong options are plausible. Duplicates of each other or of the correct
 * answer are dropped.
 */
export function pickDistractors(
  card: Flashcard,
  others: Flashcard[],
  n: number,
  getValue: (c: Flashcard) => string,
  correctAnswer: string
): string[] {
  const cardTagSet = new Set(card.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean));

  const ranked = others
    .map((c) => {
      const tagOverlap = c.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .some((t) => t && cardTagSet.has(t));
      const score =
        (c.kind === card.kind ? 4 : 0) +
        (card.wordType && c.wordType === card.wordType ? 3 : 0) +
        (c.difficulty === card.difficulty ? 2 : 0) +
        (tagOverlap ? 2 : 0) +
        Math.random() * 3; // jitter so equally-similar cards rotate between quizzes
      return { value: getValue(c), score };
    })
    .sort((a, b) => b.score - a.score);

  const seen = new Set([normalizeAnswer(correctAnswer)]);
  const result: string[] = [];
  for (const { value } of ranked) {
    const key = normalizeAnswer(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= n) break;
  }
  return result;
}

/**
 * For false true/false statements: prefer a meaning related to the card
 * (same kind, shared words/tags) so the question can't be dismissed at a
 * glance — but never the card's own meaning.
 */
function pickNearMeaning(card: Flashcard, others: Flashcard[]): string {
  const targetWords = new Set(significantWords(card.meaning));
  const cardTagSet = new Set(card.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean));

  const candidates = others.filter((c) => normalizeAnswer(c.meaning) !== normalizeAnswer(card.meaning));
  if (candidates.length === 0) return card.meaning;

  const ranked = candidates
    .map((c) => {
      const shared = significantWords(c.meaning).filter((w) => targetWords.has(w)).length;
      const tagOverlap = c.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .some((t) => t && cardTagSet.has(t));
      const score = (c.kind === card.kind ? 2 : 0) + shared * 2 + (tagOverlap ? 1 : 0) + Math.random();
      return { meaning: c.meaning, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0].meaning;
}

function exampleContainsText(card: Flashcard): boolean {
  if (!card.example) return false;
  return card.example.toLowerCase().includes(card.text.toLowerCase());
}

function blankOutText(example: string, text: string): string {
  const idx = example.toLowerCase().indexOf(text.toLowerCase());
  if (idx === -1) return example;
  return example.slice(0, idx) + "_____" + example.slice(idx + text.length);
}

/* ---------------- Answer checking ---------------- */

/** Lowercases, unifies apostrophes, strips simple punctuation and extra spaces. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,!?;:"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Case/punctuation-insensitive answer comparison for typed answers. */
export function answersMatch(expected: string, given: string): boolean {
  return normalizeAnswer(expected) === normalizeAnswer(given);
}

/**
 * Checks a typed answer against the expected one.
 * Words tolerate one small typo (edit distance 1, length ≥ 5).
 * Phrases must match in full — one word from the phrase is never enough.
 */
export function isCorrectAnswer(
  userAnswer: string,
  correctAnswer: string,
  options: { kind?: "word" | "phrase" } = {}
): boolean {
  const user = normalizeAnswer(userAnswer);
  const correct = normalizeAnswer(correctAnswer);
  if (!user) return false;
  if (user === correct) return true;

  const isPhrase = options.kind === "phrase" || correct.includes(" ");
  if (isPhrase) return false; // full phrase required, checked above

  // Single word: allow one typo for reasonably long words.
  return correct.length >= 5 && levenshtein(user, correct) <= 1;
}

/**
 * Checks a cloze (fill-in-the-blank) answer.
 * Phrase cards require the exact full phrase; words get small typo tolerance.
 */
export function checkClozeAnswer(
  userAnswer: string,
  target: string,
  kind: "word" | "phrase" = "word"
): boolean {
  if (kind === "phrase") return normalizeAnswer(userAnswer) === normalizeAnswer(target);
  return isCorrectAnswer(userAnswer, target, { kind });
}

/** Classic dynamic-programming edit distance (insert/delete/substitute). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[n];
}

function significantWords(s: string): string[] {
  return normalizeAnswer(s)
    .split(" ")
    .filter((w) => w.length >= 3);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickRandom<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}
