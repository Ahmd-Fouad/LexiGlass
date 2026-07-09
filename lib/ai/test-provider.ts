// Safe, on-demand provider connectivity test for the AI Provider Status UI.
// Reuses the exact production code path (provider.generateGrammarQuestions with
// a minimal test topic and count:1) instead of a special hard-coded prompt, so
// the test verifies real prompt-building + parsing, not a separate mock path.
// Never persists anything to the database and never returns key values.

import { getKnownProviderNames, getProviderByName } from "./quiz-generator";
import { GRAMMAR_QUESTION_TYPES } from "./providers/types";
import type { GeneratedQuestionDraft, GrammarTopicForPrompt } from "./providers/types";

export const TEST_TIMEOUT_MS = 10_000;

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  cloudflare: "Cloudflare Workers AI",
  huggingface: "Hugging Face",
  local: "Local fallback",
};

const ENV_KEY_HINTS: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  cloudflare: "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN",
  huggingface: "HF_TOKEN",
  local: "",
};

export function providerLabel(name: string): string {
  return PROVIDER_LABELS[name] ?? name;
}

/** True when `name` is one of the providers the orchestrator knows how to run. */
export function isSupportedProviderName(name: unknown): name is string {
  return typeof name === "string" && getKnownProviderNames().includes(name);
}

const TEST_TOPIC: GrammarTopicForPrompt = {
  title: "Present Simple",
  explanation: "Use the present simple for habits, routines, and general facts.",
  examples: "She walks to school every day.\nWater boils at 100 degrees Celsius.",
  commonMistakes: "She walk to school. => She walks to school.",
  notes: null,
  tags: "present simple, test",
  difficulty: "easy",
};

/** Pure: does the first draft look like a well-formed generated question? */
export function isValidTestResponseShape(drafts: GeneratedQuestionDraft[]): boolean {
  const d = drafts[0];
  if (!d) return false;
  return (
    typeof d.question === "string" &&
    d.question.trim().length > 0 &&
    typeof d.correctAnswer === "string" &&
    d.correctAnswer.trim().length > 0 &&
    typeof d.explanation === "string" &&
    d.explanation.trim().length > 0 &&
    (GRAMMAR_QUESTION_TYPES as readonly string[]).includes(d.questionType.toLowerCase().trim())
  );
}

/** Turns a thrown provider error into a short, user-safe message. Never leaks keys. */
export function friendlyProviderError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Provider request failed.";
  if (/abort/i.test(msg)) return "The request timed out.";
  if (/HTTP 401|HTTP 403/.test(msg)) return "The provider rejected the request (check the API key).";
  if (/HTTP 429/.test(msg)) return "The provider rate-limited this request. Try again in a minute.";
  if (/HTTP 5\d\d/.test(msg)) return "The provider service is currently unavailable.";
  if (/HTTP \d+/.test(msg)) return `The provider returned an error (${msg}).`;
  return "The provider request failed.";
}

export interface ProviderTestResult {
  provider: string;
  configured: boolean;
  success: boolean;
  responseShapeValid: boolean;
  message: string;
  error?: string;
}

/**
 * Runs a tiny, one-question test generation against a single provider.
 * Never throws, never saves questions, never exposes key values.
 */
export async function testProvider(name: string): Promise<ProviderTestResult> {
  const provider = getProviderByName(name);
  if (!provider) {
    return {
      provider: name,
      configured: false,
      success: false,
      responseShapeValid: false,
      message: `Unknown provider "${name}".`,
      error: `Unknown provider "${name}".`,
    };
  }

  const label = providerLabel(name);
  const configured = provider.isConfigured();
  if (!configured) {
    const hint = ENV_KEY_HINTS[name] ? ` Add ${ENV_KEY_HINTS[name]} to .env.` : "";
    const message = `${label} is not configured.${hint}`;
    return { provider: name, configured: false, success: false, responseShapeValid: false, message, error: message };
  }

  try {
    const drafts = await provider.generateGrammarQuestions(TEST_TOPIC, {
      count: 1,
      timeoutMs: TEST_TIMEOUT_MS,
    });
    const shapeValid = isValidTestResponseShape(drafts);
    if (!shapeValid) {
      const message = `${label} is configured, but the response could not be parsed. Local fallback is still available.`;
      return { provider: name, configured: true, success: false, responseShapeValid: false, message, error: message };
    }
    return {
      provider: name,
      configured: true,
      success: true,
      responseShapeValid: true,
      message: `${label} is configured and returned valid JSON.`,
    };
  } catch (e) {
    const reason = friendlyProviderError(e);
    const message = `${label} is configured, but the test request failed: ${reason} Local fallback is still available.`;
    return { provider: name, configured: true, success: false, responseShapeValid: false, message, error: message };
  }
}
