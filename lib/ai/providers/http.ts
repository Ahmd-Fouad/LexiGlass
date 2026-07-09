// Shared HTTP helpers for AI providers: a timeout-guarded fetch and a
// helper for OpenAI-compatible chat completion APIs (Groq, OpenRouter).

import { buildGrammarQuestionPrompt, parseAIQuestionJSON, SYSTEM_INSTRUCTION } from "../prompt";
import {
  DEFAULT_TIMEOUT_MS,
  type GeneratedQuestionDraft,
  type GenerateOptions,
  type GrammarTopicForPrompt,
} from "./types";

/** fetch() that aborts after timeoutMs. Throws on timeout or network error. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls an OpenAI-compatible /chat/completions endpoint and parses the reply
 * into question drafts. Used by Groq and OpenRouter (identical wire format).
 */
export async function openaiCompatibleGenerate(params: {
  url: string;
  apiKey: string;
  model: string;
  topic: GrammarTopicForPrompt;
  options: GenerateOptions;
  extraHeaders?: Record<string, string>;
}): Promise<GeneratedQuestionDraft[]> {
  const { url, apiKey, model, topic, options, extraHeaders } = params;
  const prompt = buildGrammarQuestionPrompt(topic, options.count);

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: prompt },
        ],
      }),
    },
    options.timeoutMs
  );

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseAIQuestionJSON(content);
}
