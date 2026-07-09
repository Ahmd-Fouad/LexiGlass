// Local, offline grammar-question generator. Always available (no keys, no
// network) so the whole generate → validate → save → reuse pipeline works
// with zero AI providers configured. Builds questions from the topic's own
// example sentences and "wrong => right" common mistakes, reusing the Phase 1
// corruption logic.

import { corruptSentence } from "../../grammar-quiz";
import { pickRandom, shuffle } from "../../quiz";
import type {
  AIQuizProvider,
  GeneratedQuestionDraft,
  GenerateOptions,
  GrammarTopicForPrompt,
} from "./types";

const FUNCTION_WORDS = ["is", "are", "was", "were", "have", "has", "had", "a", "an", "the", "do", "does", "did"];

export class LocalProvider implements AIQuizProvider {
  readonly name = "local";
  readonly model = "rule-based";

  /** Always usable — that's the point of the local fallback. */
  isConfigured(): boolean {
    return true;
  }

  async generateGrammarQuestions(
    topic: GrammarTopicForPrompt,
    options: GenerateOptions
  ): Promise<GeneratedQuestionDraft[]> {
    const drafts: GeneratedQuestionDraft[] = [];
    const difficulty = topic.difficulty || "medium";
    const explanationHint = topic.explanation.slice(0, 160);

    // 1. "wrong => right" mistakes → typed "correct the sentence" questions.
    const mistakes = topic.commonMistakes
      .split("\n")
      .map((line) => line.split("=>").map((s) => s.trim()))
      .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1]);

    for (const [wrong, right] of mistakes) {
      drafts.push({
        questionType: "correct_mistake",
        question: `Rewrite this sentence correctly: "${wrong}"`,
        choices: null,
        correctAnswer: right,
        explanation: explanationHint || "Fix the grammar error in the sentence.",
        difficulty,
        source: "local",
      });
    }

    // 2. Example sentences → find-the-mistake (MCQ) and fill-the-gap (typed).
    const examples = topic.examples
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 12);

    for (const [i, example] of examples.entries()) {
      const corruption = corruptSentence(example);
      if (corruption) {
        const opts = findMistakeOptions(corruption.corrupted, corruption.wrongWord);
        if (opts) {
          drafts.push({
            questionType: "find_mistake",
            question: `Which word is wrong in this sentence? "${corruption.corrupted}"`,
            choices: opts,
            correctAnswer: corruption.wrongWord,
            explanation: `The correct sentence is: "${example}"`,
            difficulty,
            source: "local",
          });
        }
      }

      // Alternate a fill-the-gap so we don't lean entirely on corruption.
      if (i % 2 === 1) {
        const gap = fillGap(example);
        if (gap) {
          drafts.push({
            questionType: "fill_gap",
            question: `Fill the gap: ${gap.blanked}`,
            choices: null,
            correctAnswer: gap.answer,
            explanation: explanationHint || `The missing word is "${gap.answer}".`,
            difficulty,
            source: "local",
          });
        }
      }
    }

    return shuffle(drafts).slice(0, options.count);
  }
}

/** The wrong word plus three other words from the sentence, shuffled. */
function findMistakeOptions(corrupted: string, wrongWord: string): string[] | null {
  const words = corrupted
    .replace(/[.,!?;:"“”]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.toLowerCase() !== wrongWord.toLowerCase());
  const unique = [...new Set(words)];
  if (unique.length < 3) return null;
  return shuffle([wrongWord, ...pickRandom(unique, 3)]);
}

/** Blanks out one word (prefer a grammar function word) from the sentence. */
function fillGap(sentence: string): { blanked: string; answer: string } | null {
  const tokens = sentence.split(/\s+/);
  const cleaned = tokens.map((t) => t.replace(/[.,!?;:"“”]/g, ""));

  let idx = cleaned.findIndex((w) => FUNCTION_WORDS.includes(w.toLowerCase()));
  if (idx === -1) {
    idx = cleaned.findIndex((w) => w.length >= 5);
  }
  if (idx === -1) return null;

  const answer = cleaned[idx];
  if (!answer) return null;
  const blankedTokens = [...tokens];
  blankedTokens[idx] = tokens[idx].replace(answer, "_____");
  return { blanked: blankedTokens.join(" "), answer };
}
