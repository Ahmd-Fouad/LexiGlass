-- Durable idempotency and server-authoritative undo snapshots for reviews.
ALTER TABLE "ReviewLog"
  ADD COLUMN "clientActionId" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'online',
  ADD COLUMN "easeFactorBefore" DOUBLE PRECISION,
  ADD COLUMN "easeFactorAfter" DOUBLE PRECISION,
  ADD COLUMN "dueDateBefore" TIMESTAMP(3),
  ADD COLUMN "dueDateAfter" TIMESTAMP(3),
  ADD COLUMN "reviewCountBefore" INTEGER,
  ADD COLUMN "reviewCountAfter" INTEGER,
  ADD COLUMN "correctCountBefore" INTEGER,
  ADD COLUMN "correctCountAfter" INTEGER,
  ADD COLUMN "incorrectCountBefore" INTEGER,
  ADD COLUMN "incorrectCountAfter" INTEGER,
  ADD COLUMN "lapsesBefore" INTEGER,
  ADD COLUMN "lapsesAfter" INTEGER,
  ADD COLUMN "lastReviewedAtBefore" TIMESTAMP(3),
  ADD COLUMN "lastReviewedAtAfter" TIMESTAMP(3),
  ADD COLUMN "revertedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ReviewLog_userId_clientActionId_key"
  ON "ReviewLog"("userId", "clientActionId");
CREATE INDEX "ReviewLog_userId_flashcardId_reviewedAt_idx"
  ON "ReviewLog"("userId", "flashcardId", "reviewedAt");
