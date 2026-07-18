import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, readJsonBody, toErrorResponse } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ratingFromCorrectness } from "@/lib/srs";
import { buildReviewTransition, reviewSnapshotData, reviewStateUpdate } from "@/lib/review-events";
import { gradeIssuedAnswer, parseQuizAnswerSubmission } from "@/lib/quiz-authority";
import { activateReplacementQuestion, RETIRE_AFTER_CORRECT } from "@/lib/grammar-question-pool";
import type { QuizAnswerResult } from "@/lib/types";

type TransactionResult = { result: QuizAnswerResult; replacementTopicId: string | null };

/**
 * Grades one persisted question. The request intentionally has no question,
 * answer key, type, correctness, or source-record fields: all authority comes
 * from QuizQuestion inside the caller's QuizSession.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const limited = await enforceRateLimit({ req, action: "quizAnswer", userId });
    if (limited) return limited;
    const parsed = await readJsonBody(req, 4 * 1024);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const submission = parseQuizAnswerSubmission(body);
    if (!submission) {
      return badRequest("Question content and grading fields are server-authoritative.");
    }

    const settled = await runSerializable(() => gradeQuestion(
      userId, submission.sessionId, submission.questionId, submission.submissionId, submission.userAnswer
    ));
    if (!settled) {
      return NextResponse.json({ error: "Quiz question not found" }, { status: 404 });
    }

    // Pool replacement is opportunistic and never part of authoritative
    // grading. All answer/SRS/mistake writes have already committed atomically.
    if (settled.replacementTopicId) {
      void activateReplacementQuestion(userId, settled.replacementTopicId).catch(() => {});
    }
    return NextResponse.json({ result: settled.result });
  } catch (e) {
    return toErrorResponse(e);
  }
}

async function gradeQuestion(
  userId: string,
  sessionId: string,
  questionId: string,
  submissionId: string,
  userAnswer: string
): Promise<TransactionResult | null> {
  return db.$transaction(async (tx) => {
    // Network retry with the same id returns the original authoritative result.
    const bySubmission = await tx.quizAnswer.findUnique({
      where: { sessionId_submissionId: { sessionId, submissionId } },
      include: { quizQuestion: true, session: { select: { userId: true } } },
    });
    if (bySubmission) {
      if (bySubmission.session.userId !== userId || bySubmission.quizQuestionId !== questionId) return null;
      return { result: resultFromAnswer(bySubmission, true), replacementTopicId: null };
    }

    const item = await tx.quizQuestion.findFirst({
      where: { id: questionId, sessionId, session: { userId } },
      include: { flashcard: true, generatedQuestion: true },
    });
    if (!item) return null;

    // This conditional update is the concurrency gate. Only one transaction
    // can move an issued item from unanswered to answered.
    const claimed = await tx.quizQuestion.updateMany({
      where: { id: item.id, answeredAt: null },
      data: { answeredAt: new Date() },
    });
    if (claimed.count === 0) {
      const existing = await tx.quizAnswer.findUnique({ where: { quizQuestionId: item.id } });
      return existing
        ? { result: resultFromAnswer(existing, true), replacementTopicId: null }
        : null;
    }

    const isCorrect = gradeIssuedAnswer({
      questionType: item.questionType,
      correctAnswer: item.correctAnswer,
      userAnswer,
      cardKind: item.cardKind,
    });

    const answer = await tx.quizAnswer.create({
      data: {
        sessionId,
        quizQuestionId: item.id,
        submissionId,
        flashcardId: item.flashcardId,
        grammarTopicId: item.grammarTopicId,
        questionType: item.questionType,
        question: item.prompt + (item.context ? ` — ${item.context}` : ""),
        correctAnswer: item.correctAnswer,
        userAnswer,
        isCorrect,
      },
    });

    if (item.flashcard) {
      const rating = ratingFromCorrectness(isCorrect);
      const reviewedAt = new Date();
      const transition = buildReviewTransition(item.flashcard, rating, reviewedAt);
      await tx.flashcard.update({
        where: { id: item.flashcard.id },
        data: reviewStateUpdate(transition.after),
      });
      await tx.reviewLog.create({
        data: {
          userId,
          flashcardId: item.flashcard.id,
          rating,
          source: "quiz",
          wasCorrect: isCorrect,
          reviewedAt,
          ...reviewSnapshotData(transition),
        },
      });
    }

    let replacementTopicId: string | null = null;
    if (item.generatedQuestion && item.generatedQuestion.userId === userId) {
      const now = new Date();
      if (isCorrect) {
        const willMaster = item.generatedQuestion.timesCorrect + 1 >= RETIRE_AFTER_CORRECT;
        await tx.generatedGrammarQuestion.update({
          where: { id: item.generatedQuestion.id },
          data: {
            timesCorrect: { increment: 1 },
            lastAnsweredAt: now,
            ...(willMaster ? { status: "mastered", retiredAt: now } : {}),
          },
        });
      } else {
        await tx.generatedGrammarQuestion.update({
          where: { id: item.generatedQuestion.id },
          data: { timesWrong: { increment: 1 }, lastAnsweredAt: now, lastShownAt: now },
        });
        await upsertGrammarMistake(tx, {
          userId,
          grammarTopicId: item.grammarTopicId,
          generatedQuestionId: item.generatedQuestion.id,
          sessionId,
          answerId: answer.id,
          question: answer.question,
          userAnswer,
          correctAnswer: item.correctAnswer,
          explanation: item.explanation ?? "",
          questionType: item.questionType,
        });
        replacementTopicId = item.grammarTopicId;
      }
    }

    return {
      result: {
        questionId: item.id,
        isCorrect,
        correctAnswer: item.correctAnswer,
        ...(item.explanation ? { explanation: item.explanation } : {}),
        duplicate: false,
      },
      replacementTopicId,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function upsertGrammarMistake(
  tx: Prisma.TransactionClient,
  input: {
    userId: string; grammarTopicId: string | null; generatedQuestionId: string;
    sessionId: string; answerId: string; question: string; userAnswer: string;
    correctAnswer: string; explanation: string; questionType: string;
  }
) {
  const existing = await tx.grammarMistake.findFirst({
    where: { userId: input.userId, generatedQuestionId: input.generatedQuestionId, status: { not: "resolved" } },
  });
  if (existing) {
    await tx.grammarMistake.update({
      where: { id: existing.id },
      data: {
        mistakeCount: { increment: 1 }, lastMistakeAt: new Date(), status: "active",
        userAnswer: input.userAnswer, correctAnswer: input.correctAnswer,
        quizSessionId: input.sessionId, quizAnswerId: input.answerId,
      },
    });
    return;
  }
  await tx.grammarMistake.create({
    data: {
      userId: input.userId, grammarTopicId: input.grammarTopicId,
      generatedQuestionId: input.generatedQuestionId, quizSessionId: input.sessionId,
      quizAnswerId: input.answerId, question: input.question, userAnswer: input.userAnswer,
      correctAnswer: input.correctAnswer, explanation: input.explanation,
      questionType: input.questionType,
    },
  });
}

function resultFromAnswer(
  answer: { quizQuestionId: string; isCorrect: boolean; correctAnswer: string },
  duplicate: boolean
): QuizAnswerResult {
  return {
    questionId: answer.quizQuestionId,
    isCorrect: answer.isCorrect,
    correctAnswer: answer.correctAnswer,
    duplicate,
  };
}

async function runSerializable<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (e) {
      if (attempt < 2 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") continue;
      throw e;
    }
  }
}
