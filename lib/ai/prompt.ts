// Prompt construction and response parsing, shared by every external
// provider and re-exported from the orchestrator. Kept separate so providers
// don't import the orchestrator (which imports providers).

import {
  GRAMMAR_QUESTION_TYPES,
  type GeneratedQuestionDraft,
  type GrammarTopicForPrompt,
} from "./providers/types";

export const SYSTEM_INSTRUCTION =
  "You are an expert English grammar teacher writing quiz questions for B1–B2 learners. " +
  "You return ONLY valid JSON — a JSON array of question objects. No markdown, no code fences, no text outside the JSON.";

/** Builds the user prompt asking a provider for `count` grammar questions. */
export function buildGrammarQuestionPrompt(topic: GrammarTopicForPrompt, count: number): string {
  const lines: string[] = [];
  lines.push(`Create ${count} English grammar quiz questions for the topic below.`);
  lines.push("");
  lines.push(`Topic title: ${topic.title}`);
  lines.push(`Explanation: ${topic.explanation}`);
  if (topic.examples.trim()) lines.push(`Example sentences:\n${topic.examples.trim()}`);
  if (topic.commonMistakes.trim()) lines.push(`Common mistakes (wrong => right):\n${topic.commonMistakes.trim()}`);
  if (topic.notes?.trim()) lines.push(`Notes: ${topic.notes.trim()}`);
  if (topic.tags.trim()) lines.push(`Tags: ${topic.tags.trim()}`);
  lines.push(`Topic difficulty: ${topic.difficulty}`);
  lines.push(`Target learner level: B1/B2.`);
  lines.push("");
  lines.push(`Allowed questionType values: ${GRAMMAR_QUESTION_TYPES.join(", ")}.`);
  lines.push("");
  lines.push("Return a JSON array where each item looks exactly like:");
  lines.push(
    JSON.stringify(
      [
        {
          questionType: "choose_correct",
          question: "Choose the correct sentence.",
          choices: [
            "I visited Dubai yesterday.",
            "I have visited Dubai yesterday.",
            "I visit Dubai yesterday.",
            "I was visited Dubai yesterday.",
          ],
          correctAnswer: "I visited Dubai yesterday.",
          explanation: "Use the past simple with finished time expressions like 'yesterday'.",
          difficulty: "medium",
          source: "ai_generated",
        },
      ],
      null,
      2
    )
  );
  lines.push("");
  lines.push("Rules:");
  lines.push("- Return JSON only. No markdown. No text outside the JSON array.");
  lines.push("- Every question must have a short explanation naming the grammar rule.");
  lines.push("- Multiple-choice questions (choose_correct, find_mistake, rule_understanding) must have exactly 4 choices.");
  lines.push("- The correctAnswer must be one of the choices for multiple-choice questions.");
  lines.push("- Typed questions (correct_mistake, fill_gap, sentence_transformation) must NOT include choices.");
  lines.push("- Wrong choices must be realistic grammar mistakes, not silly or unrelated.");
  lines.push("- Do not create trick questions. Keep sentences practical and clear.");
  lines.push("- Write in English, aimed at B1/B2 learners.");
  return lines.join("\n");
}

/**
 * Extracts a JSON array of question drafts from a raw model response.
 * Tolerates code fences and surrounding prose. Never throws — returns [] on
 * any parse failure.
 */
export function parseAIQuestionJSON(raw: string): GeneratedQuestionDraft[] {
  if (!raw || typeof raw !== "string") return [];

  let text = raw.trim();
  // Strip ```json … ``` / ``` … ``` fences.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // Narrow to the outermost array if there's surrounding prose.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Some models wrap the array in an object like { "questions": [...] }.
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const arr = Object.values(obj).find((v) => Array.isArray(v));
      if (!Array.isArray(arr)) return [];
      parsed = arr;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      questionType: String(item.questionType ?? item.type ?? "").trim(),
      question: String(item.question ?? item.prompt ?? "").trim(),
      choices: Array.isArray(item.choices)
        ? item.choices.map((c) => String(c).trim()).filter(Boolean)
        : Array.isArray(item.options)
          ? item.options.map((c) => String(c).trim()).filter(Boolean)
          : null,
      correctAnswer: String(item.correctAnswer ?? item.answer ?? "").trim(),
      explanation: String(item.explanation ?? "").trim(),
      difficulty: item.difficulty ? String(item.difficulty).trim() : undefined,
      source: item.source ? String(item.source).trim() : "ai_generated",
    }));
}
