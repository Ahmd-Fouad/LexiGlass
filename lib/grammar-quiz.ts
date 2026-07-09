// Builds a grammar quiz from two sources:
//   1. Questions generated from the user's own saved grammar topics
//      (from their example sentences and "wrong => right" common mistakes).
//   2. The built-in local question bank (lib/grammar-bank.ts), preferring
//      questions whose topic matches the user's saved topic titles/tags.
// Everything runs locally on the server — no external API, no secret keys.
//
// Selection is adaptive: topics the user answers wrong more often contribute
// more questions (see topicWeakness / sortTopicsByWeakness).

import type { GrammarTopic } from "@prisma/client";
import { GRAMMAR_BANK } from "./grammar-bank";
import type { QuizQuestion } from "./types";
import { pickRandom, shuffle } from "./quiz";

export const GRAMMAR_QUIZ_SIZE = 12;

/** Aggregated quiz history for one grammar topic. */
export interface TopicStats {
  wrong: number;
  total: number;
}

export type TopicStatsMap = Map<string, TopicStats>;

export interface GrammarQuizOptions {
  size?: number;
  /** Per-topic quiz history, used to prioritise weak topics. */
  topicStats?: TopicStatsMap;
}

/**
 * Weakness score for a topic, 0..1-ish. Higher = user struggles more.
 * Topics never quizzed get a small boost so new material still shows up.
 */
export function topicWeakness(topicId: string, stats?: TopicStatsMap): number {
  const s = stats?.get(topicId);
  if (!s || s.total === 0) return 0.4; // unseen topic: worth probing
  return s.wrong / s.total;
}

/** Weakest topics first; ties keep their original order. */
export function sortTopicsByWeakness(topics: GrammarTopic[], stats?: TopicStatsMap): GrammarTopic[] {
  return [...topics].sort((a, b) => topicWeakness(b.id, stats) - topicWeakness(a.id, stats));
}

export function buildGrammarQuiz(
  topics: GrammarTopic[],
  options: GrammarQuizOptions = {}
): QuizQuestion[] {
  const { size = GRAMMAR_QUIZ_SIZE, topicStats } = options;

  // Weak topics first, and weaker topics may contribute more questions.
  const ordered = sortTopicsByWeakness(topics, topicStats);
  const fromTopics: QuizQuestion[] = [];
  const topicBudget = Math.ceil(size / 2);
  for (const topic of ordered) {
    if (fromTopics.length >= topicBudget) break;
    const weakness = topicWeakness(topic.id, topicStats);
    const perTopicMax = weakness >= 0.5 ? 4 : 2;
    fromTopics.push(...shuffle(questionsFromTopic(topic)).slice(0, perTopicMax));
  }
  const topicQuestions = fromTopics.slice(0, topicBudget);

  // Prefer bank questions related to what the user has actually studied.
  const studied = topics
    .map((t) => `${t.title} ${t.tags}`.toLowerCase())
    .join(" ");
  const related = GRAMMAR_BANK.filter((q) =>
    q.topic.split(" ").some((w) => w.length > 3 && studied.includes(w))
  );
  const unrelated = GRAMMAR_BANK.filter((q) => !related.includes(q));

  const needed = size - topicQuestions.length;
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

  return shuffle([...topicQuestions, ...fromBank]).slice(0, size);
}

/** Generates questions from one saved grammar topic. */
export function questionsFromTopic(topic: GrammarTopic): QuizQuestion[] {
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

  // Example sentences become "choose the correct sentence" and "find the
  // mistake" questions by corrupting a copy with a common learner error.
  const examples = topic.examples
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

  for (const [i, example] of examples.entries()) {
    const corruption = corruptSentence(example);
    if (!corruption) continue;

    const findMistakeOptions = buildFindMistakeOptions(corruption.corrupted, corruption.wrongWord);
    if (i % 2 === 1 && findMistakeOptions) {
      questions.push({
        id: `topic_${topic.id}_e${i}`,
        grammarTopicId: topic.id,
        type: "find_mistake",
        prompt: `Which word is wrong in this sentence? (topic: ${topic.title})`,
        context: `“${corruption.corrupted}”`,
        options: findMistakeOptions,
        answer: corruption.wrongWord,
        explanation: `Correct sentence: “${example}”`,
      });
    } else {
      questions.push({
        id: `topic_${topic.id}_e${i}`,
        grammarTopicId: topic.id,
        type: "choose_correct",
        prompt: `Which sentence is correct? (topic: ${topic.title})`,
        options: shuffle([example, corruption.corrupted]),
        answer: example,
        explanation: topic.explanation.slice(0, 200),
      });
    }
  }

  return questions;
}

/** The corrupted word plus three other words from the sentence, shuffled. */
function buildFindMistakeOptions(corrupted: string, wrongWord: string): string[] | null {
  const words = corrupted
    .replace(/[.,!?;:"“”]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.toLowerCase() !== wrongWord.toLowerCase());
  const unique = [...new Set(words)];
  if (unique.length < 3) return null; // sentence too short for plausible options
  return shuffle([wrongWord, ...pickRandom(unique, 3)]);
}

// Simple rule-based corruption: introduces one typical learner mistake.
// Returns null when no rule applies (the example is then skipped).
export function corruptSentence(
  sentence: string
): { corrupted: string; wrongWord: string; rightWord: string } | null {
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
    const match = sentence.match(pattern);
    if (match) {
      const corrupted = sentence.replace(pattern, replacement);
      if (corrupted !== sentence) {
        return { corrupted, wrongWord: replacement, rightWord: match[0] };
      }
    }
  }
  return null;
}
