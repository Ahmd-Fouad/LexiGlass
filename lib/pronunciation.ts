// Pronunciation practice comparison logic.
//
// The browser speaks the target (speechSynthesis) and recognises the user's
// speech (SpeechRecognition); this module compares the recognised text to the
// target — entirely locally, no external speech service. Pure (no DB, no
// browser APIs) so it can be unit-tested.

import { levenshtein } from "./quiz";
import { isWeakCard, type RecentMistakeCounts } from "./review";
import type { AnalyzableCard } from "./analytics";

export interface SpeechComparison {
  target: string;
  recognized: string;
  normalizedTarget: string;
  normalizedRecognized: string;
  exactMatch: boolean;
  /** 0–100. */
  similarity: number;
  /** Target words the user did not say (in order). */
  missingWords: string[];
  /** Words the user said that aren't in the target. */
  extraWords: string[];
  /** Target words the user pronounced (exactly or very close). */
  matchedWords: string[];
}

/** Lowercase, unify apostrophes, drop punctuation, collapse and trim spaces. */
export function normalizeSpokenText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  return normalizeSpokenText(text)
    .split(" ")
    .map((w) => w.replace(/^'+|'+$/g, "")) // trim stray apostrophes
    .filter(Boolean);
}

/** Two words count as the same if identical, or one small typo apart for longer words. */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return Math.max(a.length, b.length) >= 5 && levenshtein(a, b) <= 1;
}

/**
 * Greedily aligns recognised words to target words. Each target word is matched
 * to at most one (as-yet-unused) recognised word.
 */
function align(targetWords: string[], recognizedWords: string[]) {
  const usedRecognized = new Array(recognizedWords.length).fill(false);
  const matchedTarget = new Array(targetWords.length).fill(false);

  for (let i = 0; i < targetWords.length; i++) {
    for (let j = 0; j < recognizedWords.length; j++) {
      if (usedRecognized[j]) continue;
      if (wordsMatch(targetWords[i], recognizedWords[j])) {
        usedRecognized[j] = true;
        matchedTarget[i] = true;
        break;
      }
    }
  }
  return { usedRecognized, matchedTarget };
}

/** Target words the user did not say. */
export function getMissingWords(target: string, recognized: string): string[] {
  const t = words(target);
  const r = words(recognized);
  const { matchedTarget } = align(t, r);
  return t.filter((_, i) => !matchedTarget[i]);
}

/** Words the user said that don't correspond to any target word. */
export function getExtraWords(target: string, recognized: string): string[] {
  const t = words(target);
  const r = words(recognized);
  const { usedRecognized } = align(t, r);
  return r.filter((_, j) => !usedRecognized[j]);
}

/**
 * A 0–100 closeness score blending word-level overlap (how many target words
 * were said, penalising extras) with character-level similarity (rewards
 * near-pronunciations of the whole phrase).
 */
export function calculateSpeechSimilarity(target: string, recognized: string): number {
  const normT = normalizeSpokenText(target);
  const normR = normalizeSpokenText(recognized);
  if (!normT) return 0;
  if (normT === normR) return 100;
  if (!normR) return 0;

  const t = words(target);
  const r = words(recognized);
  const { matchedTarget } = align(t, r);
  const matched = matchedTarget.filter(Boolean).length;
  const wordScore = matched / Math.max(t.length, r.length, 1);

  const maxLen = Math.max(normT.length, normR.length, 1);
  const charScore = Math.max(0, 1 - levenshtein(normT, normR) / maxLen);

  return Math.round((wordScore * 0.7 + charScore * 0.3) * 100);
}

/** Full comparison of recognised speech against the target. */
export function compareSpokenText(target: string, recognized: string): SpeechComparison {
  const normalizedTarget = normalizeSpokenText(target);
  const normalizedRecognized = normalizeSpokenText(recognized);
  const t = words(target);
  const r = words(recognized);
  const { usedRecognized, matchedTarget } = align(t, r);

  return {
    target,
    recognized,
    normalizedTarget,
    normalizedRecognized,
    exactMatch: normalizedTarget.length > 0 && normalizedTarget === normalizedRecognized,
    similarity: calculateSpeechSimilarity(target, recognized),
    missingWords: t.filter((_, i) => !matchedTarget[i]),
    extraWords: r.filter((_, j) => !usedRecognized[j]),
    matchedWords: t.filter((_, i) => matchedTarget[i]),
  };
}

/* ---------------- Target selection ---------------- */

export type PronunciationMode = "weak" | "due" | "phrases" | "sentences" | "mistakes";

export const PRONUNCIATION_MODES: PronunciationMode[] = [
  "weak",
  "due",
  "phrases",
  "sentences",
  "mistakes",
];

export const MIN_PRONUNCIATION_TARGETS = 3;
export const MAX_PRONUNCIATION_TARGETS = 15;
export const DEFAULT_PRONUNCIATION_TARGETS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A word, phrase or example sentence to read aloud and practise. */
export interface PronunciationTarget {
  id: string;
  kind: "word" | "phrase" | "sentence";
  /** The text to speak / listen to. */
  text: string;
  meaning: string;
  translation: string | null;
}

export interface PronunciationTargetOptions {
  count?: number;
  now?: Date;
  recentMistakes?: RecentMistakeCounts;
  random?: () => number;
}

/**
 * Picks pronunciation targets from the (already user-scoped) cards.
 *  - weak      → struggling words/phrases
 *  - due       → cards due for review
 *  - phrases   → phrase cards
 *  - sentences → example sentences (cards that have one)
 *  - mistakes  → recently-missed cards
 */
export function selectPronunciationTargets(
  cards: AnalyzableCard[],
  mode: PronunciationMode,
  options: PronunciationTargetOptions = {}
): PronunciationTarget[] {
  const {
    count = DEFAULT_PRONUNCIATION_TARGETS,
    now = new Date(),
    recentMistakes = new Map(),
    random = Math.random,
  } = options;
  const desired = Math.max(
    MIN_PRONUNCIATION_TARGETS,
    Math.min(MAX_PRONUNCIATION_TARGETS, Math.round(count))
  );

  let pool: AnalyzableCard[];
  switch (mode) {
    case "weak":
      pool = cards.filter(isWeakCard);
      break;
    case "due":
      pool = cards.filter((c) => c.dueDate.getTime() <= now.getTime());
      break;
    case "mistakes":
      pool = cards.filter((c) => (recentMistakes.get(c.id) ?? 0) > 0);
      break;
    case "phrases":
      pool = cards.filter((c) => c.kind === "phrase");
      break;
    case "sentences":
      pool = cards.filter((c) => (c.example ?? "").trim().length > 0);
      break;
    default:
      pool = [...cards];
  }

  const score = (c: AnalyzableCard) =>
    Math.min(recentMistakes.get(c.id) ?? 0, 5) * 10 +
    c.lapses * 4 +
    Math.min(Math.max(0, (now.getTime() - c.dueDate.getTime()) / DAY_MS), 14) +
    random() * 5;

  const ranked = [...pool].sort((a, b) => score(b) - score(a)).slice(0, desired);

  return ranked.map((c) => {
    if (mode === "sentences") {
      return {
        id: c.id,
        kind: "sentence" as const,
        text: (c.example ?? "").trim(),
        meaning: c.meaning,
        translation: c.translation,
      };
    }
    return {
      id: c.id,
      kind: c.kind === "phrase" ? ("phrase" as const) : ("word" as const),
      text: c.text,
      meaning: c.meaning,
      translation: c.translation,
    };
  });
}
