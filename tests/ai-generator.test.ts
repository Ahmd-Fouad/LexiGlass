// Tests for the AI grammar-question orchestrator: parsing, normalization,
// validation, scoring, dedupe, provider order, and fallback.
// Pure logic only — no network, no DB. Run with: npm test

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  dedupeGeneratedQuestions,
  generateWithFallback,
  generateWithProvider,
  getConfiguredExternalProviders,
  getProviderOrder,
  normalizeGeneratedQuestion,
  parseAIQuestionJSON,
  prepareGeneratedQuestions,
  scoreGeneratedQuestion,
  sourceHashForTopic,
  validateGeneratedQuestion,
} from "../lib/ai/quiz-generator";
import type {
  AIQuizProvider,
  GeneratedQuestionDraft,
  GrammarTopicForPrompt,
} from "../lib/ai/providers/types";

const TOPIC: GrammarTopicForPrompt = {
  title: "Present Perfect vs Past Simple",
  explanation: "Use the past simple for finished actions at a specific past time; the present perfect for experiences.",
  examples: "I have visited Japan twice.\nI visited Japan in 2019.",
  commonMistakes: "I have seen him yesterday. => I saw him yesterday.",
  notes: null,
  tags: "tenses, present perfect",
  difficulty: "hard",
};

function goodDraft(over: Partial<GeneratedQuestionDraft> = {}): GeneratedQuestionDraft {
  return {
    questionType: "choose_correct",
    question: "Choose the correct sentence about the past.",
    choices: [
      "I visited Japan in 2019.",
      "I have visited Japan in 2019.",
      "I visit Japan in 2019.",
      "I was visit Japan in 2019.",
    ],
    correctAnswer: "I visited Japan in 2019.",
    explanation: "Use the past simple with a finished time like '2019'.",
    difficulty: "medium",
    source: "ai_generated",
    ...over,
  };
}

/* ---------------- Env helpers ---------------- */

const AI_ENV_KEYS = [
  "AI_QUIZ_ENABLED",
  "AI_QUIZ_PROVIDER_ORDER",
  "AI_QUIZ_PRIMARY_PROVIDER",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "HF_TOKEN",
];
const savedEnv: Record<string, string | undefined> = {};
for (const k of AI_ENV_KEYS) savedEnv[k] = process.env[k];

afterEach(() => {
  for (const k of AI_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

/* ---------------- parseAIQuestionJSON ---------------- */

describe("parseAIQuestionJSON", () => {
  it("parses a plain JSON array", () => {
    const parsed = parseAIQuestionJSON(JSON.stringify([goodDraft()]));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].questionType, "choose_correct");
  });

  it("strips ```json code fences", () => {
    const raw = "```json\n" + JSON.stringify([goodDraft()]) + "\n```";
    assert.equal(parseAIQuestionJSON(raw).length, 1);
  });

  it("recovers an array from surrounding prose", () => {
    const raw = "Here are your questions:\n" + JSON.stringify([goodDraft()]) + "\nHope that helps!";
    assert.equal(parseAIQuestionJSON(raw).length, 1);
  });

  it("unwraps an object like { questions: [...] }", () => {
    const raw = JSON.stringify({ questions: [goodDraft()] });
    assert.equal(parseAIQuestionJSON(raw).length, 1);
  });

  it("returns [] for invalid JSON", () => {
    assert.deepEqual(parseAIQuestionJSON("not json at all"), []);
    assert.deepEqual(parseAIQuestionJSON(""), []);
  });
});

/* ---------------- normalize ---------------- */

describe("normalizeGeneratedQuestion", () => {
  it("maps type aliases to canonical types", () => {
    assert.equal(normalizeGeneratedQuestion(goodDraft({ questionType: "correct_sentence" })).questionType, "correct_mistake");
    assert.equal(normalizeGeneratedQuestion(goodDraft({ questionType: "fill_blank" })).questionType, "fill_gap");
  });

  it("de-duplicates MCQ choices case-insensitively", () => {
    const norm = normalizeGeneratedQuestion(
      goodDraft({ choices: ["A cat.", "a cat.", "A dog.", "A bird."] })
    );
    assert.equal(norm.choices?.length, 3);
  });

  it("drops choices for typed question types", () => {
    const norm = normalizeGeneratedQuestion(
      goodDraft({ questionType: "correct_mistake", choices: ["a", "b", "c", "d"] })
    );
    assert.equal(norm.choices, null);
  });
});

/* ---------------- validate ---------------- */

describe("validateGeneratedQuestion", () => {
  it("accepts a well-formed MCQ", () => {
    assert.equal(validateGeneratedQuestion(goodDraft(), TOPIC).ok, true);
  });

  it("rejects a missing explanation", () => {
    const r = validateGeneratedQuestion(goodDraft({ explanation: "" }), TOPIC);
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /explanation/);
  });

  it("rejects a too-short explanation", () => {
    assert.equal(validateGeneratedQuestion(goodDraft({ explanation: "no" }), TOPIC).ok, false);
  });

  it("rejects duplicate choices", () => {
    const r = validateGeneratedQuestion(
      goodDraft({
        choices: ["I visited Japan in 2019.", "I visited Japan in 2019.", "x sentence here", "y sentence here"],
      }),
      TOPIC
    );
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /duplicate|choices/);
  });

  it("rejects when the correct answer is not among the choices", () => {
    const r = validateGeneratedQuestion(
      goodDraft({ correctAnswer: "Something not offered at all." }),
      TOPIC
    );
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /correctAnswer/);
  });

  it("rejects an MCQ without exactly 4 choices", () => {
    assert.equal(
      validateGeneratedQuestion(goodDraft({ choices: ["one option", "two option"] }), TOPIC).ok,
      false
    );
  });

  it("rejects an unsupported question type", () => {
    assert.equal(validateGeneratedQuestion(goodDraft({ questionType: "essay" }), TOPIC).ok, false);
  });

  it("rejects a question unrelated to the topic", () => {
    const r = validateGeneratedQuestion(
      {
        questionType: "correct_mistake",
        question: "Zebras gallop quickly across plains.",
        choices: null,
        correctAnswer: "Zebras gallop quickly across plains.",
        explanation: "This sentence is about zebras, not the topic.",
        difficulty: "medium",
        source: "ai_generated",
      },
      TOPIC
    );
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /related/);
  });

  it("rejects overly long questions", () => {
    assert.equal(validateGeneratedQuestion(goodDraft({ question: "visited ".repeat(60) }), TOPIC).ok, false);
  });
});

/* ---------------- score ---------------- */

describe("scoreGeneratedQuestion", () => {
  it("scores a clear, topic-connected MCQ above the minimum", () => {
    assert.ok(scoreGeneratedQuestion(goodDraft(), TOPIC) >= 0.5);
  });

  it("scores a bare question lower than a rich one", () => {
    const bare = scoreGeneratedQuestion(
      goodDraft({ explanation: "Past tense.", choices: ["a b", "c d", "e f", "g h"] }),
      TOPIC
    );
    assert.ok(scoreGeneratedQuestion(goodDraft(), TOPIC) > bare);
  });
});

/* ---------------- dedupe + prepare ---------------- */

describe("dedupeGeneratedQuestions", () => {
  it("removes drafts matching existing questions or each other", () => {
    const existing = [{ question: "Choose the correct sentence about the past." }];
    const incoming = [
      goodDraft(), // duplicate of existing
      goodDraft({ question: "A brand new distinct question here." }),
      goodDraft({ question: "A brand new distinct question here." }), // dup of previous
    ];
    const result = dedupeGeneratedQuestions(existing, incoming);
    assert.equal(result.length, 1);
    assert.equal(result[0].question, "A brand new distinct question here.");
  });
});

describe("prepareGeneratedQuestions", () => {
  it("keeps valid questions and counts rejects", () => {
    const drafts = [
      goodDraft(),
      goodDraft({ question: "Another valid past-simple question here.", explanation: "Past simple for finished time." }),
      goodDraft({ explanation: "" }), // invalid
    ];
    const { valid, rejected } = prepareGeneratedQuestions(drafts, { topic: TOPIC });
    assert.equal(valid.length, 2);
    assert.equal(rejected, 1);
    assert.ok(valid.every((q) => q.qualityScore >= 0.5));
  });
});

/* ---------------- source hash ---------------- */

describe("sourceHashForTopic", () => {
  it("is stable for identical content and changes when content changes", () => {
    const a = sourceHashForTopic(TOPIC);
    assert.equal(a, sourceHashForTopic({ ...TOPIC }));
    assert.notEqual(a, sourceHashForTopic({ ...TOPIC, explanation: TOPIC.explanation + " More." }));
  });
});

/* ---------------- provider order + config ---------------- */

describe("getProviderOrder", () => {
  it("uses the default order and always ends with local", () => {
    delete process.env.AI_QUIZ_PROVIDER_ORDER;
    delete process.env.AI_QUIZ_PRIMARY_PROVIDER;
    const order = getProviderOrder();
    assert.equal(order[order.length - 1], "local");
    assert.ok(order.includes("gemini"));
  });

  it("honours AI_QUIZ_PROVIDER_ORDER", () => {
    // Explicitly cleared (not just relying on afterEach's restore): the real
    // .env sets AI_QUIZ_PRIMARY_PROVIDER as an ambient default, and importing
    // lib/db.ts (via quiz-generator.ts) triggers Prisma's automatic .env
    // load, so `savedEnv` may capture that real value instead of undefined.
    delete process.env.AI_QUIZ_PRIMARY_PROVIDER;
    process.env.AI_QUIZ_PROVIDER_ORDER = "groq,gemini";
    const order = getProviderOrder();
    assert.deepEqual(order, ["groq", "gemini", "local"]);
  });

  it("moves the primary provider to the front", () => {
    process.env.AI_QUIZ_PROVIDER_ORDER = "gemini,groq,openrouter";
    process.env.AI_QUIZ_PRIMARY_PROVIDER = "openrouter";
    assert.equal(getProviderOrder()[0], "openrouter");
  });
});

describe("getConfiguredExternalProviders", () => {
  it("detects providers by their env keys", () => {
    for (const k of ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "HF_TOKEN"]) {
      delete process.env[k];
    }
    assert.equal(getConfiguredExternalProviders().length, 0);

    process.env.GROQ_API_KEY = "test-key";
    const configured = getConfiguredExternalProviders().map((p) => p.name);
    assert.deepEqual(configured, ["groq"]);
  });
});

/* ---------------- fallback (injected chain, no network) ---------------- */

function fakeProvider(
  name: string,
  behavior: "throw" | "empty" | "ok"
): AIQuizProvider {
  return {
    name,
    model: `${name}-model`,
    isConfigured: () => true,
    async generateGrammarQuestions() {
      if (behavior === "throw") throw new Error("boom");
      if (behavior === "empty") return [];
      return [goodDraft()];
    },
  };
}

describe("generateWithProvider", () => {
  it("never throws — reports ok:false on provider error", async () => {
    const res = await generateWithProvider(fakeProvider("x", "throw"), TOPIC, 5);
    assert.equal(res.ok, false);
    assert.equal(res.drafts.length, 0);
    assert.ok(res.error);
  });
});

describe("generateWithFallback", () => {
  it("falls through failing/empty providers to the first that yields drafts", async () => {
    const chain = [
      fakeProvider("gemini", "throw"),
      fakeProvider("groq", "empty"),
      fakeProvider("local", "ok"),
    ];
    const result = await generateWithFallback(TOPIC, 5, chain);
    assert.equal(result.provider, "local");
    assert.equal(result.drafts.length, 1);
    assert.equal(result.attempts.length, 3);
    assert.equal(result.attempts[0].ok, false); // gemini threw
    assert.equal(result.attempts[1].count, 0); // groq empty
  });

  it("returns provider:null when the whole chain fails", async () => {
    const chain = [fakeProvider("gemini", "throw"), fakeProvider("groq", "empty")];
    const result = await generateWithFallback(TOPIC, 5, chain);
    assert.equal(result.provider, null);
    assert.equal(result.drafts.length, 0);
  });

  it("uses the first provider when it succeeds (no needless fallback)", async () => {
    const chain = [fakeProvider("gemini", "ok"), fakeProvider("groq", "ok")];
    const result = await generateWithFallback(TOPIC, 5, chain);
    assert.equal(result.provider, "gemini");
    assert.equal(result.attempts.length, 1);
  });
});
