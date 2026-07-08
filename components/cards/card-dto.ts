import type { Flashcard } from "@prisma/client";

// JSON-safe flashcard shape passed from server pages to client components.
export interface CardDTO {
  id: string;
  text: string;
  kind: string;
  meaning: string;
  translation: string | null;
  example: string | null;
  pronunciation: string | null;
  wordType: string | null;
  notes: string | null;
  tags: string;
  category: string | null;
  difficulty: string;
  easeFactor: number;
  intervalDays: number;
  dueDate: string;
  reviewCount: number;
  correctCount: number;
  incorrectCount: number;
  lapses: number;
  lastReviewedAt: string | null;
  createdAt: string;
}

export function toCardDTO(card: Flashcard): CardDTO {
  return {
    ...card,
    dueDate: card.dueDate.toISOString(),
    lastReviewedAt: card.lastReviewedAt?.toISOString() ?? null,
    createdAt: card.createdAt.toISOString(),
    updatedAt: undefined,
    userId: undefined,
  } as unknown as CardDTO;
}

export function cardTags(card: { tags: string }): string[] {
  return card.tags.split(",").map((t) => t.trim()).filter(Boolean);
}
