// Shared types used by both API routes and client components.

export type CardKind = "word" | "phrase";
export type Difficulty = "easy" | "medium" | "hard";

export interface CardInput {
  text: string;
  kind: CardKind;
  meaning: string;
  translation?: string;
  example?: string;
  pronunciation?: string;
  wordType?: string;
  notes?: string;
  tags?: string;
  category?: string;
  difficulty?: Difficulty;
}

export interface GrammarTopicInput {
  title: string;
  explanation: string;
  examples?: string;
  commonMistakes?: string;
  notes?: string;
  tags?: string;
  difficulty?: Difficulty;
}

export type VocabQuestionType =
  | "mcq_meaning" // show word → pick meaning
  | "mcq_word" // show meaning → pick word
  | "fill_blank" // type the missing word in the example sentence
  | "true_false"; // is this the correct meaning?

export type GrammarQuestionType =
  | "mcq"
  | "fill_blank"
  | "choose_correct"
  | "find_mistake"
  | "correct_sentence"
  // AI/local generated-question types (see lib/ai/providers/types.ts):
  | "correct_mistake"
  | "fill_gap"
  | "rule_understanding"
  | "sentence_transformation";

/** How the cards for a vocabulary quiz are chosen. */
export type VocabQuizMode = "standard" | "weak" | "mistakes" | "tag";

export interface QuizQuestion {
  /** Unique within the quiz. */
  id: string;
  flashcardId?: string;
  grammarTopicId?: string;
  /** Set when the question came from the saved generated-question pool. */
  generatedQuestionId?: string;
  type: VocabQuestionType | GrammarQuestionType;
  /** Whether the underlying card is a word or a phrase (affects answer checking). */
  kind?: "word" | "phrase";
  /** Tags of the underlying card (used for the weak-tags breakdown). */
  tags?: string[];
  prompt: string;
  /** Extra context shown under the prompt (e.g. the example sentence). */
  context?: string;
  /** Present for multiple-choice style questions. */
  options?: string[];
  /** The expected answer (option text, typed word, or "True"/"False"). */
  answer: string;
  /** Shown after answering. */
  explanation?: string;
}

export interface StartQuizResponse {
  sessionId: string;
  questions: QuizQuestion[];
}
