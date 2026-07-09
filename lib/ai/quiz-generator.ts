// Orchestrates grammar-question generation across providers:
//   choose provider order → try each with fallback → parse → normalize →
//   validate → dedupe → score → save.
//
// Network + DB happen here; the parse/normalize/validate/dedupe/score helpers
// are pure and unit-tested. External providers only run when AI_QUIZ_ENABLED
// is true and configured; the local generator is always available so the pool
// can be seeded with zero keys.

import { createHash } from "node:crypto";
import { db } from "../db";
import { buildGrammarQuestionPrompt, parseAIQuestionJSON } from "./prompt";
import { GeminiProvider } from "./providers/gemini";
import { GroqProvider } from "./providers/groq";
import { OpenRouterProvider } from "./providers/openrouter";
import { CloudflareProvider } from "./providers/cloudflare";
import { HuggingFaceProvider } from "./providers/huggingface";
import { LocalProvider } from "./providers/local";
import {
  DEFAULT_TIMEOUT_MS,
  GRAMMAR_QUESTION_TYPES,
  MAX_QUESTIONS_PER_REQUEST,
  isMcqType,
  type AIQuizProvider,
  type GeneratedQuestionDraft,
  type GrammarTopicForPrompt,
} from "./providers/types";

// Re-export so the orchestrator surface matches the spec.
export { buildGrammarQuestionPrompt, parseAIQuestionJSON };

export const MAX_SAVED_PER_TOPIC = 50;
export const MIN_QUALITY_SCORE = 0.5;
const QUESTION_MAX_LENGTH = 300;
const QUESTION_MIN_LENGTH = 8;
const EXPLANATION_MIN_LENGTH = 12;

const DEFAULT_ORDER = ["gemini", "groq", "openrouter", "cloudflare", "huggingface", "local"];

const PROVIDER_FACTORIES: Record<string, () => AIQuizProvider> = {
  gemini: () => new GeminiProvider(),
  groq: () => new GroqProvider(),
  openrouter: () => new OpenRouterProvider(),
  cloudflare: () => new CloudflareProvider(),
  huggingface: () => new HuggingFaceProvider(),
  local: () => new LocalProvider(),
};

/* ---------------- Config ---------------- */

export function isAiQuizEnabled(): boolean {
  return process.env.AI_QUIZ_ENABLED === "true";
}

/** Provider order from env (AI_QUIZ_PROVIDER_ORDER + AI_QUIZ_PRIMARY_PROVIDER), local always last. */
export function getProviderOrder(): string[] {
  const raw = process.env.AI_QUIZ_PROVIDER_ORDER;
  let order = raw
    ? raw.split(",").map((s) => s.trim().toLowerCase()).filter((n) => n in PROVIDER_FACTORIES)
    : [...DEFAULT_ORDER];
  if (order.length === 0) order = [...DEFAULT_ORDER];

  const primary = process.env.AI_QUIZ_PRIMARY_PROVIDER?.trim().toLowerCase();
  if (primary && primary in PROVIDER_FACTORIES) {
    order = [primary, ...order.filter((n) => n !== primary)];
  }

  // The local fallback is always available and always last.
  order = order.filter((n) => n !== "local");
  order.push("local");
  return order;
}

/** All providers (instantiated) in configured order. */
export function getAllProviders(): AIQuizProvider[] {
  return getProviderOrder().map((name) => PROVIDER_FACTORIES[name]());
}

/** Instantiates a single provider by name, or null for an unknown name. */
export function getProviderByName(name: string): AIQuizProvider | null {
  const factory = PROVIDER_FACTORIES[name];
  return factory ? factory() : null;
}

/** Every provider name the system knows about (for validation), local included. */
export function getKnownProviderNames(): string[] {
  return Object.keys(PROVIDER_FACTORIES);
}

/** Configured providers, in order (includes local, which is always configured). */
export function getConfiguredProviders(): AIQuizProvider[] {
  return getAllProviders().filter((p) => p.isConfigured());
}

/** Configured *external* (non-local) providers — what the UI means by "AI configured". */
export function getConfiguredExternalProviders(): AIQuizProvider[] {
  return getConfiguredProviders().filter((p) => p.name !== "local");
}

export function hasAnyExternalProvider(): boolean {
  return getConfiguredExternalProviders().length > 0;
}

/**
 * The provider chain actually used for a generation run: external providers
 * only when AI is enabled and configured, always ending with local.
 */
export function getActiveProviderChain(): AIQuizProvider[] {
  const aiOn = isAiQuizEnabled();
  return getAllProviders().filter(
    (p) => p.name === "local" || (aiOn && p.isConfigured())
  );
}

/* ---------------- Source hashing ---------------- */

/**
 * Stable hash of the topic content a question set was generated from. Stored
 * on each saved GeneratedGrammarQuestion (see saveGeneratedQuestions) so it's
 * visible which topic edit produced which questions; duplicate *questions*
 * are actually prevented by exact-text dedupe against existing active
 * questions (dedupeGeneratedQuestions / prepareGeneratedQuestions), not by
 * comparing hashes — a topic can be regenerated many times and still only
 * gain genuinely new questions.
 */
export function sourceHashForTopic(topic: GrammarTopicForPrompt): string {
  const payload = [
    topic.title,
    topic.explanation,
    topic.examples,
    topic.commonMistakes,
    topic.notes ?? "",
    topic.tags,
    topic.difficulty,
  ].join("");
  return createHash("sha1").update(payload).digest("hex");
}

/* ---------------- Normalize / validate / dedupe / score ---------------- */

export interface PreparedQuestion {
  questionType: string;
  question: string;
  choices: string[] | null;
  correctAnswer: string;
  explanation: string;
  difficulty: string;
  source: string;
  qualityScore: number;
}

function normText(s: string): string {
  return s.toLowerCase().replace(/[’']/g, "'").replace(/[.,!?;:"“”]/g, "").replace(/\s+/g, " ").trim();
}

const QUESTION_TYPE_ALIASES: Record<string, string> = {
  correct_sentence: "correct_mistake",
  mcq: "choose_correct",
  fill_blank: "fill_gap",
  transformation: "sentence_transformation",
};

/** Cleans a draft into a canonical shape (does not decide validity). */
export function normalizeGeneratedQuestion(draft: GeneratedQuestionDraft): GeneratedQuestionDraft {
  let type = draft.questionType.toLowerCase().trim();
  type = QUESTION_TYPE_ALIASES[type] ?? type;

  const difficulty = ["easy", "medium", "hard"].includes((draft.difficulty ?? "").toLowerCase())
    ? (draft.difficulty as string).toLowerCase()
    : "medium";

  let choices: string[] | null = null;
  if (isMcqType(type) && Array.isArray(draft.choices)) {
    // De-duplicate choices case-insensitively, preserving order.
    const seen = new Set<string>();
    choices = [];
    for (const c of draft.choices) {
      const t = c.trim();
      const key = normText(t);
      if (t && !seen.has(key)) {
        seen.add(key);
        choices.push(t);
      }
    }
  }

  return {
    questionType: type,
    question: draft.question.trim(),
    choices,
    correctAnswer: draft.correctAnswer.trim(),
    explanation: draft.explanation.trim(),
    difficulty,
    source: draft.source?.trim() || "ai_generated",
  };
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

const NON_LATIN = /[؀-ۿЀ-ӿ一-鿿぀-ヿ]/; // Arabic, Cyrillic, CJK, Kana

/** Validates a normalized draft against the quality/safety rules. */
export function validateGeneratedQuestion(
  draft: GeneratedQuestionDraft,
  topic?: GrammarTopicForPrompt
): ValidationResult {
  const q = normalizeGeneratedQuestion(draft);

  if (!q.question) return { ok: false, reason: "missing question" };
  if (q.question.length < QUESTION_MIN_LENGTH) return { ok: false, reason: "question too short" };
  if (q.question.length > QUESTION_MAX_LENGTH) return { ok: false, reason: "question too long" };
  if (!q.correctAnswer) return { ok: false, reason: "missing correctAnswer" };
  if (!q.explanation) return { ok: false, reason: "missing explanation" };
  if (q.explanation.length < EXPLANATION_MIN_LENGTH) return { ok: false, reason: "explanation too short" };
  if (!(GRAMMAR_QUESTION_TYPES as readonly string[]).includes(q.questionType)) {
    return { ok: false, reason: "unsupported question type" };
  }
  if (NON_LATIN.test(q.question) || NON_LATIN.test(q.correctAnswer)) {
    return { ok: false, reason: "non-English content" };
  }

  if (isMcqType(q.questionType)) {
    const choices = q.choices ?? [];
    if (choices.length !== 4) return { ok: false, reason: "MCQ must have exactly 4 choices" };
    const normed = choices.map(normText);
    if (new Set(normed).size !== normed.length) return { ok: false, reason: "duplicate choices" };
    if (!normed.includes(normText(q.correctAnswer))) {
      return { ok: false, reason: "correctAnswer not in choices" };
    }
  }

  // Relatedness: share at least one meaningful word with the topic.
  if (topic) {
    const topicWords = new Set(
      normText(`${topic.title} ${topic.tags} ${topic.explanation} ${topic.examples}`)
        .split(" ")
        .filter((w) => w.length >= 4)
    );
    if (topicWords.size > 0) {
      const qWords = normText(`${q.question} ${q.correctAnswer} ${q.explanation}`).split(" ");
      const related = qWords.some((w) => w.length >= 4 && topicWords.has(w));
      if (!related) return { ok: false, reason: "not related to grammar topic" };
    }
  }

  return { ok: true };
}

/** 0..1 quality score. Prefers clear, practical, topic-connected questions. */
export function scoreGeneratedQuestion(
  draft: GeneratedQuestionDraft,
  topic?: GrammarTopicForPrompt
): number {
  const q = normalizeGeneratedQuestion(draft);
  let score = 0.4;

  if (q.explanation.length >= 25) score += 0.15;
  if (q.question.length >= 20 && q.question.length <= 200) score += 0.1;

  if (isMcqType(q.questionType)) {
    const choices = q.choices ?? [];
    if (choices.length === 4 && new Set(choices.map(normText)).size === 4) score += 0.15;
  } else {
    score += 0.1; // typed questions can't have weak distractors
  }

  if (topic) {
    const topicWords = new Set(
      normText(`${topic.title} ${topic.tags} ${topic.explanation}`)
        .split(" ")
        .filter((w) => w.length >= 4)
    );
    const qWords = normText(`${q.question} ${q.correctAnswer}`).split(" ");
    const overlap = qWords.filter((w) => w.length >= 4 && topicWords.has(w)).length;
    if (overlap >= 1) score += 0.1;
    if (overlap >= 3) score += 0.1;
  }

  // A rule-naming explanation reads as higher quality.
  if (/\b(tense|verb|noun|article|plural|singular|past|present|perfect|preposition|adjective|adverb)\b/i.test(q.explanation)) {
    score += 0.05;
  }

  return Math.min(1, Math.round(score * 100) / 100);
}

/** Removes incoming drafts that duplicate an existing question or each other. */
export function dedupeGeneratedQuestions(
  existing: { question: string }[],
  incoming: GeneratedQuestionDraft[]
): GeneratedQuestionDraft[] {
  const seen = new Set(existing.map((e) => normText(e.question)));
  const result: GeneratedQuestionDraft[] = [];
  for (const draft of incoming) {
    const key = normText(draft.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(draft);
  }
  return result;
}

/**
 * Full pure pipeline: normalize → validate → dedupe → score → keep only
 * questions above MIN_QUALITY_SCORE. Returns valid prepared questions plus
 * how many were rejected.
 */
export function prepareGeneratedQuestions(
  drafts: GeneratedQuestionDraft[],
  opts: { existing?: { question: string }[]; topic?: GrammarTopicForPrompt } = {}
): { valid: PreparedQuestion[]; rejected: number } {
  const { existing = [], topic } = opts;
  const deduped = dedupeGeneratedQuestions(existing, drafts);

  const valid: PreparedQuestion[] = [];
  let rejected = drafts.length - deduped.length;

  for (const draft of deduped) {
    const check = validateGeneratedQuestion(draft, topic);
    if (!check.ok) {
      rejected++;
      continue;
    }
    const score = scoreGeneratedQuestion(draft, topic);
    if (score < MIN_QUALITY_SCORE) {
      rejected++;
      continue;
    }
    const norm = normalizeGeneratedQuestion(draft);
    valid.push({
      questionType: norm.questionType,
      question: norm.question,
      choices: norm.choices ?? null,
      correctAnswer: norm.correctAnswer,
      explanation: norm.explanation,
      difficulty: norm.difficulty ?? "medium",
      source: norm.source ?? "ai_generated",
      qualityScore: score,
    });
  }

  return { valid, rejected };
}

/* ---------------- Generation (network) ---------------- */

export interface ProviderAttempt {
  provider: string;
  model: string;
  ok: boolean;
  count: number;
  error?: string;
}

export interface GenerationResult {
  provider: string | null; // the provider that produced the drafts
  model: string;
  drafts: GeneratedQuestionDraft[];
  attempts: ProviderAttempt[];
}

/** Runs one provider, never throwing. */
export async function generateWithProvider(
  provider: AIQuizProvider,
  topic: GrammarTopicForPrompt,
  count: number
): Promise<{ ok: boolean; drafts: GeneratedQuestionDraft[]; error?: string }> {
  try {
    const drafts = await provider.generateGrammarQuestions(topic, {
      count: Math.min(count, MAX_QUESTIONS_PER_REQUEST),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    return { ok: true, drafts };
  } catch (e) {
    return { ok: false, drafts: [], error: e instanceof Error ? e.message : "provider failed" };
  }
}

/**
 * Tries providers in order until one returns at least one draft, else falls
 * back to local. Never throws.
 */
export async function generateWithFallback(
  topic: GrammarTopicForPrompt,
  count = MAX_QUESTIONS_PER_REQUEST,
  chainOverride?: AIQuizProvider[]
): Promise<GenerationResult> {
  const chain = chainOverride ?? getActiveProviderChain();
  const attempts: ProviderAttempt[] = [];

  for (const provider of chain) {
    const result = await generateWithProvider(provider, topic, count);
    attempts.push({
      provider: provider.name,
      model: provider.model,
      ok: result.ok,
      count: result.drafts.length,
      error: result.error,
    });
    if (result.ok && result.drafts.length > 0) {
      return { provider: provider.name, model: provider.model, drafts: result.drafts, attempts };
    }
  }

  return { provider: null, model: "", drafts: [], attempts };
}

/* ---------------- Persistence ---------------- */

/**
 * Saves prepared questions as active pool entries, respecting the per-topic
 * cap. Assumes ownership was already verified by the caller.
 */
export async function saveGeneratedQuestions(
  userId: string,
  grammarTopicId: string,
  questions: PreparedQuestion[],
  meta: { provider: string; model: string; sourceHash: string }
): Promise<number> {
  if (questions.length === 0) return 0;

  // Cap the number of live (non-rejected) questions per topic.
  const liveCount = await db.generatedGrammarQuestion.count({
    where: { grammarTopicId, status: { not: "rejected" } },
  });
  const room = Math.max(0, MAX_SAVED_PER_TOPIC - liveCount);
  if (room === 0) return 0;

  const toSave = questions.slice(0, room);
  await db.generatedGrammarQuestion.createMany({
    data: toSave.map((q) => ({
      userId,
      grammarTopicId,
      provider: meta.provider,
      model: meta.model,
      sourceHash: meta.sourceHash,
      questionType: q.questionType,
      question: q.question,
      choices: q.choices ?? undefined,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty,
      source: q.source,
      status: "active",
      qualityScore: q.qualityScore,
    })),
  });

  return toSave.length;
}
