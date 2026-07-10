// Writing Practice: pick a set of target words/phrases, then analyse the
// sentences/paragraph the user writes with them — entirely with local rules,
// no AI. Pure module (no DB access) so it can be unit-tested; the API route
// fetches user-scoped cards and calls these.

import { containsTarget } from "./cloze";
import { levenshtein } from "./quiz";
import { isWeakCard } from "./review";
import type { AnalyzableCard } from "./analytics";
import type { RecentMistakeCounts } from "./review";

export type WritingMode = "weak" | "due" | "mistakes" | "random" | "tag" | "phrases";

export const WRITING_MODES: WritingMode[] = ["weak", "due", "mistakes", "random", "tag", "phrases"];

export const MIN_WRITING_TARGETS = 3;
export const MAX_WRITING_TARGETS = 10;
export const DEFAULT_WRITING_TARGETS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A word/phrase the user is asked to write with. */
export interface WritingTarget {
  id: string;
  text: string;
  kind: "word" | "phrase";
  meaning: string;
  translation: string | null;
  example: string | null;
}

export interface WritingTargetOptions {
  /** Desired number of targets (clamped to 3–10). */
  count?: number;
  now?: Date;
  recentMistakes?: RecentMistakeCounts;
  /** Required for mode "tag". */
  tag?: string | null;
  /** Injectable shuffle source for deterministic tests. */
  random?: () => number;
}

function cardTags(card: { tags: string }): string[] {
  return card.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
}

/** Maps a card (structural Flashcard subset) to a writing target. */
export function cardToWritingTarget(card: AnalyzableCard): WritingTarget {
  return {
    id: card.id,
    text: card.text,
    kind: card.kind === "phrase" ? "phrase" : "word",
    meaning: card.meaning,
    translation: card.translation,
    example: card.example,
  };
}

/**
 * Score used to order the target pool: struggling/overdue cards first so the
 * writing practice targets what needs work. Modes without a natural priority
 * (random, tag, phrases) rely mostly on the injected jitter.
 */
function targetScore(
  card: AnalyzableCard,
  now: Date,
  recentMistakes: RecentMistakeCounts,
  jitter: number
): number {
  const overdueDays = Math.max(0, (now.getTime() - card.dueDate.getTime()) / DAY_MS);
  const accuracy = card.reviewCount > 0 ? card.correctCount / card.reviewCount : 1;
  return (
    Math.min(recentMistakes.get(card.id) ?? 0, 5) * 10 +
    card.lapses * 5 +
    (card.reviewCount >= 3 ? (1 - accuracy) * 12 : 0) +
    Math.min(overdueDays, 14) +
    (card.difficulty === "hard" ? 4 : card.difficulty === "medium" ? 2 : 0) +
    jitter * 6
  );
}

/**
 * Picks 3–10 target words/phrases for a writing session. Pure over the given
 * (already user-scoped) cards.
 *  - weak     → cards the user keeps getting wrong
 *  - due      → cards due for review
 *  - mistakes → cards missed recently (wrong quiz answer / Again rating)
 *  - phrases  → phrase cards only
 *  - tag      → cards carrying the tag
 *  - random   → any card
 */
export function selectWritingTargets(
  cards: AnalyzableCard[],
  mode: WritingMode,
  options: WritingTargetOptions = {}
): WritingTarget[] {
  const {
    count = DEFAULT_WRITING_TARGETS,
    now = new Date(),
    recentMistakes = new Map(),
    tag,
    random = Math.random,
  } = options;
  const desired = Math.max(MIN_WRITING_TARGETS, Math.min(MAX_WRITING_TARGETS, Math.round(count)));

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
    case "tag": {
      const wanted = (tag ?? "").trim().toLowerCase();
      pool = wanted ? cards.filter((c) => cardTags(c).includes(wanted)) : [];
      break;
    }
    case "random":
    default:
      pool = [...cards];
  }

  const ranked = pool
    .map((card) => ({ card, score: targetScore(card, now, recentMistakes, random()) }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.card);

  return ranked.slice(0, desired).map(cardToWritingTarget);
}

/* ---------------- Analysis ---------------- */

export interface TargetUsage {
  id: string;
  text: string;
  kind: "word" | "phrase";
  /** Full target present as a whole word/phrase. */
  used: boolean;
  /** Same as `used` for words; for phrases: full phrase present. */
  complete: boolean;
  /** Phrase only: some (not all) words present, full phrase missing. */
  partial: boolean;
}

export interface SpellingSuspect {
  wrote: string;
  target: string;
}

export interface WritingFeedback {
  wordCount: number;
  sentenceCount: number;
  targets: TargetUsage[];
  usedTargets: string[];
  missingTargets: string[];
  incompleteTargets: string[];
  repeatedWords: string[];
  possibleSpelling: SpellingSuspect[];
  endsWithPunctuation: boolean;
  capitalizationOk: boolean;
  hasVeryShortSentence: boolean;
  warnings: string[];
  strengths: string[];
  score: number;
}

/** Everything analyzeWritingAttempt computes before the numeric score. */
export type WritingAnalysis = Omit<WritingFeedback, "score">;

const STOPWORDS = new Set([
  "the", "and", "that", "this", "with", "have", "will", "would", "your", "from",
  "they", "them", "their", "there", "then", "than", "into", "over", "very", "just",
  "about", "because", "which", "when", "what", "were", "been", "some", "more", "also",
]);

/** Normalises whitespace and apostrophes but keeps case (needed for capitalisation checks). */
export function normalizeWritingText(text: string): string {
  return text.replace(/[’']/g, "'").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

function tokenize(text: string): string[] {
  return (text.match(/[A-Za-z][A-Za-z']*/g) ?? []).map((w) => w.toLowerCase());
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z]/.test(s));
}

function significantWords(phrase: string): string[] {
  return tokenize(phrase).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Detects whether a target was used in the text.
 * Words: present as a whole word. Phrases: the full phrase must appear;
 * `partial` flags when only some of its words show up.
 */
export function detectTargetUsage(
  text: string,
  target: string | { text: string; kind?: string | null }
): TargetUsage {
  const targetText = typeof target === "string" ? target : target.text;
  const kind: "word" | "phrase" =
    (typeof target === "object" && target.kind === "phrase") || targetText.trim().includes(" ")
      ? "phrase"
      : "word";
  const id = typeof target === "object" && "id" in target ? String((target as { id?: string }).id) : targetText;

  const fullyUsed = containsTarget(text, targetText);
  if (kind === "word") {
    return { id, text: targetText, kind, used: fullyUsed, complete: fullyUsed, partial: false };
  }
  const parts = significantWords(targetText);
  const present = parts.filter((w) => containsTarget(text, w)).length;
  return {
    id,
    text: targetText,
    kind,
    used: fullyUsed,
    complete: fullyUsed,
    partial: !fullyUsed && present > 0,
  };
}

/** Words repeated 3+ times (excluding stopwords and short words). */
function findRepeatedWords(tokens: string[]): string[] {
  const counts = new Map<string, number>();
  for (const w of tokens) {
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 3).map(([w]) => w);
}

/** Tokens that look like a one-letter typo of a target word (but aren't an exact target). */
function findSpellingSuspects(tokens: string[], targets: WritingTarget[]): SpellingSuspect[] {
  const targetWords = new Set<string>();
  for (const t of targets) for (const w of significantWords(t.text)) targetWords.add(w);
  if (targetWords.size === 0) return [];

  const seen = new Set<string>();
  const suspects: SpellingSuspect[] = [];
  for (const token of tokens) {
    if (token.length < 4 || targetWords.has(token) || seen.has(token)) continue;
    for (const tw of targetWords) {
      if (Math.abs(tw.length - token.length) > 1) continue;
      if (levenshtein(token, tw) === 1) {
        suspects.push({ wrote: token, target: tw });
        seen.add(token);
        break;
      }
    }
    if (suspects.length >= 4) break;
  }
  return suspects;
}

/**
 * Analyses a writing attempt against its target words/phrases using local
 * rules only, and returns actionable feedback plus a 0–100 score.
 */
export function analyzeWritingAttempt(text: string, targets: WritingTarget[]): WritingFeedback {
  const normalized = normalizeWritingText(text);
  const tokens = tokenize(normalized);
  const sentences = splitSentences(normalized);
  const wordCount = tokens.length;
  const sentenceCount = sentences.length;

  const usages = targets.map((t) => detectTargetUsage(normalized, t));
  const usedTargets = usages.filter((u) => u.complete).map((u) => u.text);
  const missingTargets = usages.filter((u) => !u.used && !u.partial).map((u) => u.text);
  const incompleteTargets = usages.filter((u) => u.partial).map((u) => u.text);

  const repeatedWords = findRepeatedWords(tokens);
  const possibleSpelling = findSpellingSuspects(tokens, targets);

  const endsWithPunctuation = /[.!?]["')\]]?\s*$/.test(normalized) || normalized.length === 0;
  const capitalizationOk = sentences.every((s) => {
    const first = s.match(/[A-Za-z]/);
    return !first || first[0] === first[0].toUpperCase();
  });
  const hasVeryShortSentence = sentences.some((s) => tokenize(s).length > 0 && tokenize(s).length < 3);

  /* ---- Human-readable warnings & strengths ---- */
  const warnings: string[] = [];
  const strengths: string[] = [];

  if (wordCount === 0) {
    warnings.push("Write at least one sentence using the target words.");
  } else {
    if (missingTargets.length > 0) {
      warnings.push(
        `Try to use all target words. Missing: ${missingTargets.join(", ")}.`
      );
    }
    for (const inc of incompleteTargets) {
      warnings.push(`This phrase should be used completely: “${inc}”.`);
    }
    if (wordCount < Math.max(20, targets.length * 8)) {
      warnings.push("Your paragraph is very short — add more detail to each sentence.");
    }
    if (sentenceCount < targets.length) {
      warnings.push("Try writing at least one full sentence for each target word.");
    }
    if (!endsWithPunctuation) {
      warnings.push("End your sentences with punctuation (. ! ?).");
    }
    if (!capitalizationOk) {
      warnings.push("Make sure every sentence starts with a capital letter.");
    }
    if (hasVeryShortSentence) {
      warnings.push("Some sentences are very short — try to expand them.");
    }
    if (repeatedWords.length > 0) {
      warnings.push(`You repeat some words a lot: ${repeatedWords.join(", ")}. Vary your vocabulary.`);
    }
    for (const s of possibleSpelling) {
      warnings.push(`Possible spelling: you wrote “${s.wrote}” — did you mean “${s.target}”?`);
    }

    if (usedTargets.length === targets.length) strengths.push("You used every target word — great job!");
    else if (usedTargets.length > 0) strengths.push(`You used ${usedTargets.length} of ${targets.length} target words.`);
    if (sentenceCount >= targets.length && sentenceCount > 1) strengths.push("Good sentence variety.");
    if (endsWithPunctuation && capitalizationOk && wordCount > 0) strengths.push("Clean punctuation and capitalization.");
    if (wordCount >= targets.length * 12) strengths.push("Nice, detailed writing.");
  }

  const analysis: WritingAnalysis = {
    wordCount,
    sentenceCount,
    targets: usages,
    usedTargets,
    missingTargets,
    incompleteTargets,
    repeatedWords,
    possibleSpelling,
    endsWithPunctuation,
    capitalizationOk,
    hasVeryShortSentence,
    warnings,
    strengths,
  };

  return { ...analysis, score: scoreWritingAttempt(analysis) };
}

/**
 * Turns an analysis into a 0–100 score. Using the target words completely is
 * the main driver; length, sentence structure and mechanics fill the rest.
 */
export function scoreWritingAttempt(a: WritingAnalysis): number {
  const targetCount = a.targets.length;
  if (a.wordCount === 0 || targetCount === 0) return 0;

  // Target usage — the core of the score (up to 55). Incomplete phrases earn half credit.
  const completeCredit = a.usedTargets.length;
  const partialCredit = a.incompleteTargets.length * 0.5;
  const usageScore = Math.min(1, (completeCredit + partialCredit) / targetCount) * 55;

  // Length adequacy — ~8 words per target (up to 20).
  const lengthScore = Math.min(1, a.wordCount / (targetCount * 8)) * 20;

  // Sentence coverage — roughly one sentence per target (up to 10).
  const sentenceScore = Math.min(1, a.sentenceCount / targetCount) * 10;

  // Mechanics — punctuation, capitalization, no very-short sentences (up to 15).
  let mechanics = 15;
  if (!a.endsWithPunctuation) mechanics -= 5;
  if (!a.capitalizationOk) mechanics -= 5;
  if (a.hasVeryShortSentence) mechanics -= 3;
  if (a.repeatedWords.length > 0) mechanics -= 2;
  mechanics = Math.max(0, mechanics);

  const total = usageScore + lengthScore + sentenceScore + mechanics;
  return Math.max(0, Math.min(100, Math.round(total)));
}
