// OpenRouter provider — OpenAI-compatible; supports free models via the
// ":free" suffix. Docs: https://openrouter.ai/docs

import { openaiCompatibleGenerate } from "./http";
import type {
  AIQuizProvider,
  GeneratedQuestionDraft,
  GenerateOptions,
  GrammarTopicForPrompt,
} from "./types";

export class OpenRouterProvider implements AIQuizProvider {
  readonly name = "openrouter";
  readonly model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";

  isConfigured(): boolean {
    return !!process.env.OPENROUTER_API_KEY;
  }

  async generateGrammarQuestions(
    topic: GrammarTopicForPrompt,
    options: GenerateOptions
  ): Promise<GeneratedQuestionDraft[]> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return [];
    return openaiCompatibleGenerate({
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey,
      model: this.model,
      topic,
      options,
      // Optional attribution headers recommended by OpenRouter.
      extraHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://lexiglass.app",
        "X-Title": "LexiGlass",
      },
    });
  }
}
