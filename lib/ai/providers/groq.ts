// Groq provider — OpenAI-compatible chat completions, generous free tier.
// Docs: https://console.groq.com/docs/openai

import { openaiCompatibleGenerate } from "./http";
import type {
  AIQuizProvider,
  GeneratedQuestionDraft,
  GenerateOptions,
  GrammarTopicForPrompt,
} from "./types";

export class GroqProvider implements AIQuizProvider {
  readonly name = "groq";
  readonly model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  isConfigured(): boolean {
    return !!process.env.GROQ_API_KEY;
  }

  async generateGrammarQuestions(
    topic: GrammarTopicForPrompt,
    options: GenerateOptions
  ): Promise<GeneratedQuestionDraft[]> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return [];
    return openaiCompatibleGenerate({
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey,
      model: this.model,
      topic,
      options,
    });
  }
}
