// Full cloze (fill-in-the-blank) practice.
//
// A cloze hides the target word/phrase inside its own example sentence and
// asks the user to type it back — active recall that's harder than flipping a
// card. This is the canonical, reusable cloze module used by the vocabulary
// quiz, review mode and any future cloze surface.
//
// Pure (no DB access) so it can be unit-tested. It reuses the answer
// normalisation and typo-tolerance primitives from lib/quiz.ts so cloze
// checking behaves exactly like the vocab quiz's typed answers. quiz.ts must
// not import this module in return (keeps the dependency one-directional).

import { isCorrectAnswer, levenshtein, normalizeAnswer } from "./quiz";

/** The gap shown in place of the hidden target. */
export const CLOZE_BLANK = "______";

/** The minimal card shape a cloze needs (structural subset of Flashcard/CardDTO). */
export interface ClozeCard {
  text: string;
  kind?: string | null; // "word" | "phrase"
  example?: string | null;
  meaning?: string;
  translation?: string | null;
}

export interface ClozeCheckOptions {
  /** "phrase" requires the exact full phrase; "word" allows one small typo. */
  kind?: "word" | "phrase";
  /** Allow one small typo for single words (default true). Phrases never tolerate typos. */
  allowTypos?: boolean;
}

export interface ClozePrompt {
  /** The example sentence with the target replaced by a blank. */
  sentence: string;
  /** The word/phrase the user must supply. */
  answer: string;
  kind: "word" | "phrase";
}

export interface ClozeResult {
  correct: boolean;
  normalizedAnswer: string;
  normalizedTarget: string;
  /** Rough closeness, 0..1 (1 = exact after normalisation). Handy for "so close!" hints. */
  similarity: number;
}

/** Lowercase, unify apostrophes, drop simple punctuation, collapse and trim spaces. */
export function normalizeClozeAnswer(answer: string): string {
  return normalizeAnswer(answer);
}

/**
 * Builds a whole-word / whole-phrase regex for the target so "win" never
 * matches inside "winning" and "get rid of" matches the full phrase.
 * Boundaries are non-lookbehind (group 1 captures the preceding delimiter) so
 * it works in every browser, not just ones with lookbehind support.
 */
function buildTargetRegex(target: string, global: boolean): RegExp | null {
  const t = target.trim();
  if (!t) return null;
  const escaped = t
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // escape regex specials
    .replace(/\s+/g, "\\s+"); // tolerate any whitespace between phrase words
  const flags = `${global ? "g" : ""}iu`;
  return new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=[^\\p{L}\\p{N}]|$)`, flags);
}

/**
 * True when `sentence` contains `target` as a whole word / whole phrase
 * ("win" does not match inside "winning"; "get rid of" matches the full
 * phrase). Case-insensitive. The one shared matcher used across cloze and
 * writing-practice target detection.
 */
export function containsTarget(sentence: string, target: string): boolean {
  const re = buildTargetRegex(target, false);
  return re ? re.test(sentence) : false;
}

/**
 * True when a cloze can be made from this card: it has an example sentence
 * that actually contains the target word/phrase as a whole word/phrase.
 * Cloze must never be generated when the target is missing from the example.
 */
export function canCreateCloze(card: ClozeCard): boolean {
  if (!card.example || !card.text.trim()) return false;
  return containsTarget(card.example, card.text);
}

/**
 * Replaces every whole-word occurrence of the target in the sentence with a
 * blank, preserving the surrounding text. Returns the sentence unchanged if
 * the target isn't present (callers should gate on canCreateCloze first).
 */
export function createClozePrompt(sentence: string, target: string): string {
  const re = buildTargetRegex(target, true);
  if (!re) return sentence;
  return sentence.replace(re, (_match, pre: string) => `${pre}${CLOZE_BLANK}`);
}

/** Builds the full cloze prompt for a card, or null when one can't be made. */
export function buildClozeFromCard(card: ClozeCard): ClozePrompt | null {
  if (!canCreateCloze(card)) return null;
  const kind = card.kind === "phrase" ? "phrase" : "word";
  return {
    sentence: createClozePrompt(card.example ?? "", card.text),
    answer: card.text,
    kind,
  };
}

/**
 * Checks a typed cloze answer.
 *  - Case-insensitive, whitespace-trimmed, punctuation-insensitive (normalised).
 *  - Phrases require the exact full phrase — one word from the phrase is never enough.
 *  - Single words tolerate one small typo (edit distance 1, length ≥ 5).
 */
export function checkClozeAnswer(
  userAnswer: string,
  target: string,
  options: ClozeCheckOptions = {}
): boolean {
  const user = normalizeClozeAnswer(userAnswer);
  if (!user) return false;

  const kind = options.kind ?? (normalizeClozeAnswer(target).includes(" ") ? "phrase" : "word");
  const allowTypos = options.allowTypos ?? true;

  if (kind === "phrase" || !allowTypos) {
    return user === normalizeClozeAnswer(target);
  }
  // Single word: exact match or one small typo (handled by isCorrectAnswer).
  return isCorrectAnswer(userAnswer, target, { kind: "word" });
}

/**
 * Full evaluation of a cloze answer against a card — correctness plus a
 * similarity score, for richer UI feedback ("Not quite — you were close").
 */
export function evaluateCloze(userAnswer: string, card: ClozeCard): ClozeResult {
  const kind = card.kind === "phrase" ? "phrase" : "word";
  const correct = checkClozeAnswer(userAnswer, card.text, { kind });
  const normalizedTarget = normalizeClozeAnswer(card.text);
  const normalizedAnswer = normalizeClozeAnswer(userAnswer);

  const maxLen = Math.max(normalizedTarget.length, normalizedAnswer.length, 1);
  const similarity = correct
    ? 1
    : Math.max(0, 1 - levenshtein(normalizedAnswer, normalizedTarget) / maxLen);

  return {
    correct,
    normalizedAnswer,
    normalizedTarget,
    similarity: Math.round(similarity * 100) / 100,
  };
}
