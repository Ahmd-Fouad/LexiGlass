// Builds a grammar quiz from two sources:
//   1. Questions generated from the user's own saved grammar topics
//      (from their example sentences and "wrong => right" common mistakes).
//   2. The built-in local question bank (lib/grammar-bank.ts), preferring
//      questions whose topic matches the user's saved topic titles/tags.
// Everything runs locally on the server — no external API, no secret keys.

import type { GrammarTopic } from "@prisma/client";
import { GRAMMAR_BANK } from "./grammar-bank";
import type { QuizQuestion } from "./types";
import { pickRandom, shuffle } from "./quiz";

export const GRAMMAR_QUIZ_SIZE = 12;

export function buildGrammarQuiz(topics: GrammarTopic[], size = GRAMMAR_QUIZ_SIZE): QuizQuestion[] {
  const fromTopics = shuffle(topics.flatMap((t) => questionsFromTopic(t))).slice(
    0,
    Math.ceil(size / 2)
  );

  // Prefer bank questions related to what the user has actually studied.
  const studied = topics
    .map((t) => `${t.title} ${t.tags}`.toLowerCase())
    .join(" ");
  const related = GRAMMAR_BANK.filter((q) =>
    q.topic.split(" ").some((w) => w.length > 3 && studied.includes(w))
  );
  const unrelated = GRAMMAR_BANK.filter((q) => !related.includes(q));

  const needed = size - fromTopics.length;
  const fromBank = [...pickRandom(related, needed), ...pickRandom(unrelated, needed)]
    .slice(0, needed)
    .map((q, i) => ({
      id: `bank_${i}_${q.topic.replace(/\s+/g, "_")}`,
      type: q.type,
      prompt: q.prompt,
      context: q.context,
      options: q.options ? shuffle(q.options) : undefined,
      answer: q.answer,
      explanation: q.explanation,
    }));

  return shuffle([...fromTopics, ...fromBank]).slice(0, size);
}

/** Generates questions from one saved grammar topic. */
function questionsFromTopic(topic: GrammarTopic): QuizQuestion[] {
  const questions: QuizQuestion[] = [];

  // "wrong => right" lines become "correct the sentence" and "choose correct" questions.
  const mistakes = topic.commonMistakes
    .split("\n")
    .map((line) => line.split("=>").map((s) => s.trim()))
    .filter((parts): parts is [string, string] => parts.length === 2 && !!parts[0] && !!parts[1]);

  mistakes.forEach(([wrong, right], i) => {
    if (i % 2 === 0) {
      questions.push({
        id: `topic_${topic.id}_m${i}`,
        grammarTopicId: topic.id,
        type: "correct_sentence",
        prompt: `Correct this sentence (topic: ${topic.title}):`,
        context: `“${wrong}”`,
        answer: right,
        explanation: topic.explanation.slice(0, 200),
      });
    } else {
      questions.push({
        id: `topic_${topic.id}_m${i}`,
        grammarTopicId: topic.id,
        type: "choose_correct",
        prompt: `Which sentence is correct? (topic: ${topic.title})`,
        options: shuffle([right, wrong]),
        answer: right,
        explanation: topic.explanation.slice(0, 200),
      });
    }
  });

  // Example sentences become "choose the correct sentence" questions by
  // corrupting a copy of the example with a common learner error.
  const examples = topic.examples
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

  for (const [i, example] of examples.entries()) {
    const corrupted = corruptSentence(example);
    if (!corrupted) continue;
    questions.push({
      id: `topic_${topic.id}_e${i}`,
      grammarTopicId: topic.id,
      type: "choose_correct",
      prompt: `Which sentence is correct? (topic: ${topic.title})`,
      options: shuffle([example, corrupted]),
      answer: example,
      explanation: topic.explanation.slice(0, 200),
    });
  }

  return questions;
}

// Simple rule-based corruption: introduces one typical learner mistake.
// Returns null when no rule applies (the example is then skipped).
function corruptSentence(sentence: string): string | null {
  const swaps: Array<[RegExp, string]> = [
    [/\bdoesn't\b/i, "don't"],
    [/\bdon't\b/i, "doesn't"],
    [/\bwere\b/i, "was"],
    [/\bwas\b/i, "were"],
    [/\bhave\b/i, "has"],
    [/\bhas\b/i, "have"],
    [/\ban\b/i, "a"],
    [/\bis\b/i, "are"],
    [/\bare\b/i, "is"],
    [/\bwent\b/i, "goed"],
    [/\bchildren\b/i, "childs"],
    [/\bthan\b/i, "then"],
  ];
  for (const [pattern, replacement] of swaps) {
    if (pattern.test(sentence)) {
      const corrupted = sentence.replace(pattern, replacement);
      if (corrupted !== sentence) return corrupted;
    }
  }
  return null;
}
