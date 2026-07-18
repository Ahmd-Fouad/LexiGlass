-- Deterministic cursor pagination for user-owned library collections.
CREATE INDEX "Flashcard_userId_createdAt_id_idx"
  ON "Flashcard"("userId", "createdAt", "id");

DROP INDEX IF EXISTS "GrammarTopic_userId_idx";
CREATE INDEX "GrammarTopic_userId_createdAt_id_idx"
  ON "GrammarTopic"("userId", "createdAt", "id");

-- Version locally interpreted JSON so future shape migrations can be explicit.
ALTER TABLE "WritingAttempt"
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;
