// Cloudflare Workers AI provider (free daily allocation).
// Docs: https://developers.cloudflare.com/workers-ai/

import { buildGrammarQuestionPrompt, parseAIQuestionJSON, SYSTEM_INSTRUCTION } from "../prompt";
import { fetchWithTimeout } from "./http";
import type {
  AIQuizProvider,
  GeneratedQuestionDraft,
  GenerateOptions,
  GrammarTopicForPrompt,
} from "./types";

export class CloudflareProvider implements AIQuizProvider {
  readonly name = "cloudflare";
  readonly model = process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.1-8b-instruct";

  isConfigured(): boolean {
    return !!process.env.CLOUDFLARE_ACCOUNT_ID && !!process.env.CLOUDFLARE_API_TOKEN;
  }

  async generateGrammarQuestions(
    topic: GrammarTopicForPrompt,
    options: GenerateOptions
  ): Promise<GeneratedQuestionDraft[]> {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !token) return [];

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${this.model}`;
    const prompt = buildGrammarQuestionPrompt(topic, options.count);

    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: prompt },
          ],
        }),
      },
      options.timeoutMs
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as {
      result?: { response?: string };
    };
    return parseAIQuestionJSON(data.result?.response ?? "");
  }
}
