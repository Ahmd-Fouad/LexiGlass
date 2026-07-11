import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, str, strOrEmpty, toErrorResponse } from "@/lib/api-helpers";
import { applyRating, ratingFromCorrectness } from "@/lib/srs";
import {
  activateReplacementQuestion,
  recordWrongGrammarQuestion,
  retireCorrectQuestion,
} from "@/lib/grammar-question-pool";

/**
 * Records one answered quiz question. For vocabulary questions it also updates
 * the card's SRS schedule (correct → "good", wrong → "again"). For generated
 * grammar questions it retires correct ones (mastered, never deleted) and
 * routes wrong ones into the Grammar Mistake bank, topping up the pool.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));

    const sessionId = str(body.sessionId, 100);
    const question = str(body.question, 1000);
    const correctAnswer = strOrEmpty(body.correctAnswer, 1000);
    const userAnswer = strOrEmpty(body.userAnswer, 1000) || "(no answer)";
    const isCorrect = body.isCorrect === true;
    if (!sessionId || !question) return badRequest("sessionId and question are required.");

    const session = await db.quizSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      return NextResponse.json({ error: "Quiz session not found" }, { status: 404 });
    }

    const flashcardIdRaw = str(body.flashcardId, 100);
    const grammarTopicIdRaw = str(body.grammarTopicId, 100);
    const generatedQuestionIdRaw = str(body.generatedQuestionId, 100);
    const questionType = strOrEmpty(body.questionType, 50) || "mcq";

    // Referenced entities must belong to the caller before they're attached to
    // the answer or the mistake bank — the Mistake Bank joins topic titles and
    // generated-question choices back into the UI, so a foreign id here would
    // surface another user's content. Ids that don't resolve to an owned row
    // are dropped (the answer itself is still recorded), which also keeps a
    // deleted/bogus id from breaking the foreign-key constraint.
    const [card, ownedTopic, ownedGenerated] = await Promise.all([
      flashcardIdRaw
        ? db.flashcard.findFirst({ where: { id: flashcardIdRaw, userId } })
        : null,
      grammarTopicIdRaw
        ? db.grammarTopic.findFirst({ where: { id: grammarTopicIdRaw, userId }, select: { id: true } })
        : null,
      generatedQuestionIdRaw
        ? db.generatedGrammarQuestion.findFirst({
            where: { id: generatedQuestionIdRaw, userId },
            select: { id: true },
          })
        : null,
    ]);
    const grammarTopicId = ownedTopic?.id ?? null;
    const generatedQuestionId = ownedGenerated?.id ?? null;

    const answer = await db.quizAnswer.create({
      data: {
        sessionId,
        flashcardId: card?.id,
        grammarTopicId: grammarTopicId ?? undefined,
        questionType,
        question,
        correctAnswer,
        userAnswer,
        isCorrect,
      },
    });

    // Vocabulary answers drive the SRS schedule.
    if (card) {
      const rating = ratingFromCorrectness(isCorrect);
      const next = applyRating(card, rating);
      await db.$transaction([
        db.flashcard.update({
          where: { id: card.id },
          data: {
            easeFactor: next.easeFactor,
            intervalDays: next.intervalDays,
            dueDate: next.dueDate,
            reviewCount: { increment: 1 },
            correctCount: { increment: isCorrect ? 1 : 0 },
            incorrectCount: { increment: isCorrect ? 0 : 1 },
            lapses: { increment: isCorrect ? 0 : 1 },
            lastReviewedAt: new Date(),
          },
        }),
        db.reviewLog.create({
          data: {
            userId,
            flashcardId: card.id,
            rating,
            wasCorrect: isCorrect,
            intervalBefore: card.intervalDays,
            intervalAfter: next.intervalDays,
          },
        }),
      ]);
    }

    // Generated grammar questions: retire correct, bank wrong + top up pool.
    if (generatedQuestionId) {
      if (isCorrect) {
        await retireCorrectQuestion(generatedQuestionId, userId);
      } else {
        await recordWrongGrammarQuestion({
          userId,
          grammarTopicId: grammarTopicId ?? null,
          generatedQuestionId,
          quizSessionId: sessionId,
          quizAnswerId: answer.id,
          question,
          userAnswer,
          correctAnswer,
          explanation: strOrEmpty(body.explanation, 1000),
          questionType,
        });
        // Non-blocking: activate/generate a replacement if the pool is low.
        if (grammarTopicId) void activateReplacementQuestion(userId, grammarTopicId).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
