import type { GrammarTopic } from "@prisma/client";

export interface GrammarTopicDTO {
  id: string;
  title: string;
  explanation: string;
  examples: string;
  commonMistakes: string;
  notes: string | null;
  tags: string;
  difficulty: string;
  createdAt: string;
}

export function toGrammarDTO(topic: GrammarTopic): GrammarTopicDTO {
  return {
    id: topic.id,
    title: topic.title,
    explanation: topic.explanation,
    examples: topic.examples,
    commonMistakes: topic.commonMistakes,
    notes: topic.notes,
    tags: topic.tags,
    difficulty: topic.difficulty,
    createdAt: topic.createdAt.toISOString(),
  };
}
