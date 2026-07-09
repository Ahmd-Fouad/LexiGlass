// Google Gemini provider (free tier: gemini-1.5-flash).
// Docs: https://ai.google.dev/api/generate-content

import { buildGrammarQuestionPrompt, parseAIQuestionJSON, SYSTEM_INSTRUCTION } from "../prompt";
import { fetchWithTimeout } from "./http";
import type {
  AIQuizProvider,
  GeneratedQuestionDraft,
  GenerateOptions,
  GrammarTopicForPrompt,
} from "./types";

export class GeminiProvider implements AIQuizProvider {
  readonly name = "gemini";
  readonly model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async generateGrammarQuestions(
    topic: GrammarTopicForPrompt,
    options: GenerateOptions
  ): Promise<GeneratedQuestionDraft[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return [];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
    const prompt = buildGrammarQuestionPrompt(topic, options.count);

    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, responseMimeType: "application/json" },
        }),
      },
      options.timeoutMs
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return parseAIQuestionJSON(text);
  }
}
