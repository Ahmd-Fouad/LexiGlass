import { checkClozeAnswer } from "./cloze";
import { answersMatch } from "./quiz";
import type { IssuedQuizQuestion, QuizQuestion } from "./types";

/** Removes every authoritative grading field before a question reaches a client. */
export function toIssuedQuestion(question: QuizQuestion): IssuedQuizQuestion {
  const { answer: _answer, explanation: _explanation, ...safe } = question;
  return safe;
}

/** The single server-side grading rule used by the quiz answer route. */
export function gradeIssuedAnswer(input: {
  questionType: string;
  correctAnswer: string;
  userAnswer: string;
  cardKind?: string | null;
}): boolean {
  if (input.questionType === "fill_blank" && input.cardKind) {
    return checkClozeAnswer(input.userAnswer, input.correctAnswer, {
      kind: input.cardKind === "phrase" ? "phrase" : "word",
    });
  }
  return answersMatch(input.correctAnswer, input.userAnswer);
}

export interface QuizAnswerSubmission {
  sessionId: string;
  questionId: string;
  submissionId: string;
  userAnswer: string;
}

const FORBIDDEN_GRADING_FIELDS = [
  "isCorrect", "correctAnswer", "question", "questionType", "flashcardId",
  "grammarTopicId", "generatedQuestionId",
] as const;

/** Strict public contract: callers may identify an issued item, never redefine it. */
export function parseQuizAnswerSubmission(value: unknown): QuizAnswerSubmission | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (FORBIDDEN_GRADING_FIELDS.some((field) => field in body)) return null;
  const clean = (field: string, max: number) => {
    const v = body[field];
    return typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;
  };
  const sessionId = clean("sessionId", 100);
  const questionId = clean("questionId", 100);
  const submissionId = clean("submissionId", 100);
  const userAnswer = typeof body.userAnswer === "string" && body.userAnswer.length <= 1000
    ? body.userAnswer.trim() || "(no answer)"
    : null;
  return sessionId && questionId && submissionId && userAnswer
    ? { sessionId, questionId, submissionId, userAnswer }
    : null;
}
