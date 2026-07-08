import type { Flashcard } from "@prisma/client";
import type { QuizQuestion, VocabQuestionType } from "./types";

export const QUIZ_SIZE = 20;
export const MIN_CARDS_FOR_QUIZ = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Picks the cards for a vocabulary quiz, prioritising (in this order of weight):
 *  1. cards due today (more overdue = higher priority)
 *  2. cards answered wrong before (lapses / incorrect answers)
 *  3. difficult cards
 *  4. cards not reviewed for the longest time
 * If fewer than `size` cards are due, older studied cards fill the rest.
 */
export function selectQuizCards(cards: Flashcard[], size = QUIZ_SIZE, now = new Date()): Flashcard[] {
  const scored = cards.map((card) => {
    const overdueDays = Math.max(0, (now.getTime() - card.dueDate.getTime()) / DAY_MS);
    const isDue = card.dueDate.getTime() <= now.getTime();
    const daysSinceReview = card.lastReviewedAt
      ? (now.getTime() - card.lastReviewedAt.getTime()) / DAY_MS
      : (now.getTime() - card.createdAt.getTime()) / DAY_MS + 2; // never reviewed → slightly boosted
    const difficultyBoost = card.difficulty === "hard" ? 10 : card.difficulty === "medium" ? 3 : 0;

    const score =
      (isDue ? 100 + overdueDays * 2 : 0) +
      card.lapses * 6 +
      card.incorrectCount * 3 +
      difficultyBoost +
      Math.min(daysSinceReview, 30);

    // Small jitter so equal-score cards get shuffled between quizzes.
    return { card, score: score + Math.random() * 2 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, size).map((s) => s.card);
}

/** Builds a mixed-type question for each selected card, using the other cards as distractors. */
export function buildVocabQuestions(selected: Flashcard[], pool: Flashcard[]): QuizQuestion[] {
  const types: VocabQuestionType[] = ["mcq_meaning", "mcq_word", "fill_blank", "true_false"];

  return selected.map((card, i) => {
    let type = types[i % types.length];
    // fill_blank needs an example sentence that actually contains the word.
    if (type === "fill_blank" && !exampleContainsText(card)) type = "mcq_meaning";
    return buildQuestion(card, type, pool, i);
  });
}

function buildQuestion(card: Flashcard, type: VocabQuestionType, pool: Flashcard[], index: number): QuizQuestion {
  const others = pool.filter((c) => c.id !== card.id);
  const id = `q${index}_${card.id}`;

  switch (type) {
    case "mcq_meaning": {
      const distractors = pickRandom(others, 3).map((c) => c.meaning);
      return {
        id,
        flashcardId: card.id,
        type,
        prompt: `What does “${card.text}” mean?`,
        context: card.wordType ? `(${card.wordType})` : undefined,
        options: shuffle([card.meaning, ...distractors]),
        answer: card.meaning,
        explanation: card.example ? `Example: ${card.example}` : undefined,
      };
    }
    case "mcq_word": {
      const distractors = pickRandom(others, 3).map((c) => c.text);
      return {
        id,
        flashcardId: card.id,
        type,
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
        prompt: "Type the missing word or phrase:",
        context: blanked,
        answer: card.text,
        explanation: `Meaning: ${card.meaning}`,
      };
    }
    case "true_false": {
      const useReal = Math.random() < 0.5 || others.length === 0;
      const shownMeaning = useReal ? card.meaning : pickRandom(others, 1)[0].meaning;
      return {
        id,
        flashcardId: card.id,
        type,
        prompt: `Does “${card.text}” mean: “${shownMeaning}”?`,
        options: ["True", "False"],
        answer: useReal ? "True" : "False",
        explanation: useReal ? undefined : `“${card.text}” actually means: ${card.meaning}`,
      };
    }
  }
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

/** Case/punctuation-insensitive answer comparison for typed answers. */
export function answersMatch(expected: string, given: string): boolean {
  return normalize(expected) === normalize(given);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,!?;:"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
