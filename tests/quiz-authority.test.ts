import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gradeIssuedAnswer,
  parseQuizAnswerSubmission,
  toIssuedQuestion,
} from "../lib/quiz-authority";
import type { QuizQuestion } from "../lib/types";

const question: QuizQuestion = {
  id: "issued-1",
  type: "mcq_meaning",
  prompt: "What does resilient mean?",
  options: ["fragile", "able to recover"],
  answer: "able to recover",
  explanation: "Resilient means able to recover quickly.",
  flashcardId: "card-1",
};

describe("server-authoritative quiz contract", () => {
  it("never exposes the answer or explanation in an issued question", () => {
    const safe = toIssuedQuestion(question);
    assert.equal("answer" in safe, false);
    assert.equal("explanation" in safe, false);
    assert.equal(safe.id, question.id);
  });

  it("accepts only ids, userAnswer and submissionId", () => {
    assert.deepEqual(parseQuizAnswerSubmission({
      sessionId: "session-1", questionId: "question-1", submissionId: "submission-1", userAnswer: "answer",
    }), {
      sessionId: "session-1", questionId: "question-1", submissionId: "submission-1", userAnswer: "answer",
    });
  });

  it("rejects forged isCorrect and correctAnswer fields", () => {
    const base = { sessionId: "s", questionId: "q", submissionId: "x", userAnswer: "wrong" };
    assert.equal(parseQuizAnswerSubmission({ ...base, isCorrect: true }), null);
    assert.equal(parseQuizAnswerSubmission({ ...base, correctAnswer: "wrong" }), null);
  });

  it("rejects forged source references and question content", () => {
    const base = { sessionId: "s", questionId: "q", submissionId: "x", userAnswer: "a" };
    assert.equal(parseQuizAnswerSubmission({ ...base, flashcardId: "foreign" }), null);
    assert.equal(parseQuizAnswerSubmission({ ...base, question: "forged" }), null);
  });

  it("grades vocabulary and grammar from the stored answer", () => {
    assert.equal(gradeIssuedAnswer({
      questionType: "fill_blank", correctAnswer: "meticulous", userAnswer: "meticuluos", cardKind: "word",
    }), false);
    assert.equal(gradeIssuedAnswer({
      questionType: "fill_blank", correctAnswer: "meticulous", userAnswer: "meticulou", cardKind: "word",
    }), true);
    assert.equal(gradeIssuedAnswer({
      questionType: "choose_correct", correctAnswer: "I saw him yesterday.", userAnswer: "i saw him yesterday",
    }), true);
  });

  it("requires the full phrase for vocabulary cloze", () => {
    assert.equal(gradeIssuedAnswer({
      questionType: "fill_blank", correctAnswer: "get rid of", userAnswer: "rid", cardKind: "phrase",
    }), false);
  });
});

