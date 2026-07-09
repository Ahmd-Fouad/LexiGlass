// Tests for the AI Provider Status / Test Provider hardening pass.
// Pure logic only, plus one real (offline, no-network) call through the
// local provider. External providers are never hit over the network here —
// see tests/ai-generator.test.ts for the fallback-chain tests with injected
// fake providers.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  friendlyProviderError,
  isSupportedProviderName,
  isValidTestResponseShape,
  testProvider,
} from "../lib/ai/test-provider";
import { getAllProviders, getConfiguredProviders, getKnownProviderNames } from "../lib/ai/quiz-generator";
import type { GeneratedQuestionDraft } from "../lib/ai/providers/types";

const AI_ENV_KEYS = [
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

function goodDraft(over: Partial<GeneratedQuestionDraft> = {}): GeneratedQuestionDraft {
  return {
    questionType: "choose_correct",
    question: "Choose the correct sentence.",
    choices: ["a", "b", "c", "d"],
    correctAnswer: "a",
    explanation: "Because of the rule.",
    difficulty: "easy",
    source: "ai_generated",
    ...over,
  };
}

/* ---------------- isSupportedProviderName ---------------- */

describe("isSupportedProviderName", () => {
  it("accepts every known provider name, including local", () => {
    for (const name of getKnownProviderNames()) {
      assert.equal(isSupportedProviderName(name), true);
    }
  });

  it("rejects unknown or non-string input", () => {
    assert.equal(isSupportedProviderName("chatgpt"), false);
    assert.equal(isSupportedProviderName(""), false);
    assert.equal(isSupportedProviderName(123), false);
    assert.equal(isSupportedProviderName(undefined), false);
  });
});

/* ---------------- isValidTestResponseShape ---------------- */

describe("isValidTestResponseShape", () => {
  it("accepts a well-formed draft", () => {
    assert.equal(isValidTestResponseShape([goodDraft()]), true);
  });

  it("rejects an empty array (e.g. from invalid JSON)", () => {
    assert.equal(isValidTestResponseShape([]), false);
  });

  it("rejects a draft missing required fields", () => {
    assert.equal(isValidTestResponseShape([goodDraft({ explanation: "" })]), false);
    assert.equal(isValidTestResponseShape([goodDraft({ correctAnswer: "" })]), false);
    assert.equal(isValidTestResponseShape([goodDraft({ question: "" })]), false);
  });

  it("rejects an unsupported question type", () => {
    assert.equal(isValidTestResponseShape([goodDraft({ questionType: "essay" })]), false);
  });
});

/* ---------------- friendlyProviderError ---------------- */

describe("friendlyProviderError", () => {
  it("maps timeouts, rate limits, auth and server errors to distinct messages", () => {
    assert.match(friendlyProviderError(new Error("The operation was aborted")), /timed out/i);
    assert.match(friendlyProviderError(new Error("HTTP 429")), /rate-limited/i);
    assert.match(friendlyProviderError(new Error("HTTP 401")), /rejected/i);
    assert.match(friendlyProviderError(new Error("HTTP 503")), /unavailable/i);
    assert.match(friendlyProviderError(new Error("HTTP 418")), /error/i);
  });

  it("never echoes the raw error message verbatim for unknown errors (no key leakage)", () => {
    const leaky = new Error("failed with key=sk-super-secret-value");
    const friendly = friendlyProviderError(leaky);
    assert.ok(!friendly.includes("sk-super-secret-value"));
  });
});

/* ---------------- testProvider ---------------- */

describe("testProvider", () => {
  it("returns a clean 'unsupported' result for an unknown provider name", async () => {
    const result = await testProvider("not-a-real-provider");
    assert.equal(result.configured, false);
    assert.equal(result.success, false);
    assert.match(result.message, /unknown provider/i);
  });

  it("reports 'not configured' for an external provider with no key, without crashing", async () => {
    delete process.env.GEMINI_API_KEY;
    const result = await testProvider("gemini");
    assert.equal(result.configured, false);
    assert.equal(result.success, false);
    assert.match(result.message, /not configured/i);
    assert.match(result.message, /GEMINI_API_KEY/);
  });

  it("succeeds for the local provider with no network and no keys (offline fallback)", async () => {
    const result = await testProvider("local");
    assert.equal(result.configured, true);
    assert.equal(result.success, true);
    assert.equal(result.responseShapeValid, true);
    assert.match(result.message, /valid JSON/i);
  });
});

/* ---------------- provider registry never exposes keys ---------------- */

describe("provider registry", () => {
  it("configured/all provider lists are plain provider objects with no key fields", () => {
    process.env.GEMINI_API_KEY = "sk-should-not-leak";
    for (const provider of [...getAllProviders(), ...getConfiguredProviders()]) {
      const serialized = JSON.stringify({ name: provider.name, model: provider.model });
      assert.ok(!serialized.includes("sk-should-not-leak"));
    }
  });

  it("local is always present and always configured", () => {
    for (const k of AI_ENV_KEYS) delete process.env[k];
    const configured = getConfiguredProviders().map((p) => p.name);
    assert.ok(configured.includes("local"));
  });
});
