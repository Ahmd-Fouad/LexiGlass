-- Persist every issued quiz question so grading is server-authoritative.
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "questionType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "context" TEXT,
    "options" JSONB,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT,
    "cardKind" TEXT,
    "tags" JSONB,
    "flashcardId" TEXT,
    "grammarTopicId" TEXT,
    "generatedQuestionId" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- Existing answer history is preserved by creating a legacy issued item for
-- each answer before the new required relation is enforced.
INSERT INTO "QuizQuestion" (
    "id", "sessionId", "orderIndex", "questionType", "prompt",
    "correctAnswer", "flashcardId", "grammarTopicId", "answeredAt", "createdAt"
)
SELECT
    'legacy-' || qa."id",
    qa."sessionId",
    ROW_NUMBER() OVER (PARTITION BY qa."sessionId" ORDER BY qa."createdAt", qa."id") - 1,
    qa."questionType",
    qa."question",
    qa."correctAnswer",
    qa."flashcardId",
    qa."grammarTopicId",
    qa."createdAt",
    qa."createdAt"
FROM "QuizAnswer" qa;

ALTER TABLE "QuizAnswer" ADD COLUMN "quizQuestionId" TEXT;
ALTER TABLE "QuizAnswer" ADD COLUMN "submissionId" TEXT;

UPDATE "QuizAnswer"
SET "quizQuestionId" = 'legacy-' || "id",
    "submissionId" = 'legacy-' || "id";

ALTER TABLE "QuizAnswer" ALTER COLUMN "quizQuestionId" SET NOT NULL;
ALTER TABLE "QuizAnswer" ALTER COLUMN "submissionId" SET NOT NULL;

CREATE UNIQUE INDEX "QuizQuestion_sessionId_orderIndex_key" ON "QuizQuestion"("sessionId", "orderIndex");
CREATE INDEX "QuizQuestion_sessionId_answeredAt_idx" ON "QuizQuestion"("sessionId", "answeredAt");
CREATE INDEX "QuizQuestion_flashcardId_idx" ON "QuizQuestion"("flashcardId");
CREATE INDEX "QuizQuestion_grammarTopicId_idx" ON "QuizQuestion"("grammarTopicId");
CREATE INDEX "QuizQuestion_generatedQuestionId_idx" ON "QuizQuestion"("generatedQuestionId");
CREATE UNIQUE INDEX "QuizAnswer_quizQuestionId_key" ON "QuizAnswer"("quizQuestionId");
CREATE UNIQUE INDEX "QuizAnswer_sessionId_submissionId_key" ON "QuizAnswer"("sessionId", "submissionId");
CREATE INDEX "QuizAnswer_sessionId_idx" ON "QuizAnswer"("sessionId");
CREATE INDEX "QuizAnswer_flashcardId_createdAt_idx" ON "QuizAnswer"("flashcardId", "createdAt");
CREATE INDEX "QuizAnswer_grammarTopicId_createdAt_idx" ON "QuizAnswer"("grammarTopicId", "createdAt");

ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "QuizSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_flashcardId_fkey"
  FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_grammarTopicId_fkey"
  FOREIGN KEY ("grammarTopicId") REFERENCES "GrammarTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_generatedQuestionId_fkey"
  FOREIGN KEY ("generatedQuestionId") REFERENCES "GeneratedGrammarQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_quizQuestionId_fkey"
  FOREIGN KEY ("quizQuestionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
