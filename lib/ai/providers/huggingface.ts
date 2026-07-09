// Hugging Face Inference API provider (optional; free tier is rate-limited).
// Docs: https://huggingface.co/docs/api-inference

import { buildGrammarQuestionPrompt, SYSTEM_INSTRUCTION, parseAIQuestionJSON } from "../prompt";
import { fetchWithTimeout } from "./http";
import type {
  AIQuizProvider,
  GeneratedQuestionDraft,
  GenerateOptions,
  GrammarTopicForPrompt,
} from "./types";

export class HuggingFaceProvider implements AIQuizProvider {
  readonly name = "huggingface";
  readonly model = process.env.HF_MODEL || "mistralai/Mistral-7B-Instruct-v0.3";

  isConfigured(): boolean {
    return !!process.env.HF_TOKEN;
  }

  async generateGrammarQuestions(
    topic: GrammarTopicForPrompt,
    options: GenerateOptions
  ): Promise<GeneratedQuestionDraft[]> {
    const token = process.env.HF_TOKEN;
    if (!token) return [];

    const url = `https://api-inference.huggingface.co/models/${this.model}`;
    const prompt = `${SYSTEM_INSTRUCTION}\n\n${buildGrammarQuestionPrompt(topic, options.count)}`;

    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { max_new_tokens: 1500, temperature: 0.5, return_full_text: false },
        }),
      },
      options.timeoutMs
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as
      | { generated_text?: string }[]
      | { generated_text?: string };
    const text = Array.isArray(data) ? data[0]?.generated_text ?? "" : data.generated_text ?? "";
    return parseAIQuestionJSON(text);
  }
}
