import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, oneOf, toErrorResponse } from "@/lib/api-helpers";
import { buildVocabQuestions, MIN_CARDS_FOR_QUIZ, selectQuizCards } from "@/lib/quiz";
import { buildGrammarQuiz } from "@/lib/grammar-quiz";
import type { StartQuizResponse } from "@/lib/types";

/**
 * Starts a quiz session and returns its questions.
 * type "vocab": ~20 cards picked by the spaced-repetition priority rules.
 * type "grammar": questions from the user's saved topics + the local bank.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const type = oneOf(body.type, ["vocab", "grammar"] as const, "vocab");

    let questions;
    if (type === "vocab") {
      const cards = await db.flashcard.findMany({ where: { userId } });
      if (cards.length < MIN_CARDS_FOR_QUIZ) {
        return badRequest(
          `You need at least ${MIN_CARDS_FOR_QUIZ} cards to start a quiz. Add a few more words first!`
        );
      }
      const selected = selectQuizCards(cards);
      questions = buildVocabQuestions(selected, cards);
    } else {
      const topics = await db.grammarTopic.findMany({ where: { userId } });
      questions = buildGrammarQuiz(topics);
    }

    const session = await db.quizSession.create({
      data: { userId, type, totalQuestions: questions.length },
    });

    const response: StartQuizResponse = { sessionId: session.id, questions };
    return NextResponse.json(response);
  } catch (e) {
    return toErrorResponse(e);
  }
}
