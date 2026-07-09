// Shared types for the AI grammar-question generation system.
// Providers (gemini, groq, …, local) all implement AIQuizProvider and never
// throw for expected failures — the orchestrator handles fallback.

export const GRAMMAR_QUESTION_TYPES = [
  "choose_correct",
  "correct_mistake",
  "find_mistake",
  "fill_gap",
  "rule_understanding",
  "sentence_transformation",
] as const;

export type GrammarGenQuestionType = (typeof GRAMMAR_QUESTION_TYPES)[number];

/** Question types that must carry exactly 4 multiple-choice options. */
export const MCQ_QUESTION_TYPES: GrammarGenQuestionType[] = [
  "choose_correct",
  "find_mistake",
  "rule_understanding",
];

/** Question types answered by typing text (no choices). */
export const TYPED_QUESTION_TYPES: GrammarGenQuestionType[] = [
  "correct_mistake",
  "fill_gap",
  "sentence_transformation",
];

export function isMcqType(type: string): boolean {
  return (MCQ_QUESTION_TYPES as string[]).includes(type);
}

/** The topic content handed to a provider to generate questions from. */
export interface GrammarTopicForPrompt {
  title: string;
  explanation: string;
  examples: string;
  commonMistakes: string;
  notes: string | null;
  tags: string;
  difficulty: string;
}

/** A raw question as returned by a provider, before validation/normalization. */
export interface GeneratedQuestionDraft {
  questionType: string;
  question: string;
  choices?: string[] | null;
  correctAnswer: string;
  explanation: string;
  difficulty?: string;
  source?: string; // "ai_generated" | "local"
}

export interface GenerateOptions {
  /** How many questions to ask the provider for (best effort). */
  count: number;
  /** Abort the provider call after this many ms. */
  timeoutMs?: number;
}

export interface AIQuizProvider {
  /** Stable id stored on generated questions and logs. */
  readonly name: string;
  /** Default model id (may be overridden per provider via env). */
  readonly model: string;
  /** True when the provider has the env config it needs to run. */
  isConfigured(): boolean;
  /** Returns question drafts. Resolves to [] on any expected failure. */
  generateGrammarQuestions(
    topic: GrammarTopicForPrompt,
    options: GenerateOptions
  ): Promise<GeneratedQuestionDraft[]>;
}

export const DEFAULT_TIMEOUT_MS = 20_000;
export const MAX_QUESTIONS_PER_REQUEST = 10;
