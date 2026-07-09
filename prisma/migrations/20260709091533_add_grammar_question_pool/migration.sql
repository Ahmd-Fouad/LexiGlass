-- CreateTable
CREATE TABLE "GeneratedGrammarQuestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grammarTopicId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "sourceHash" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "choices" JSONB,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "source" TEXT NOT NULL DEFAULT 'ai_generated',
    "status" TEXT NOT NULL DEFAULT 'active',
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timesShown" INTEGER NOT NULL DEFAULT 0,
    "timesCorrect" INTEGER NOT NULL DEFAULT 0,
    "timesWrong" INTEGER NOT NULL DEFAULT 0,
    "lastShownAt" TIMESTAMP(3),
    "lastAnsweredAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedGrammarQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarMistake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grammarTopicId" TEXT,
    "generatedQuestionId" TEXT,
    "quizSessionId" TEXT,
    "quizAnswerId" TEXT,
    "question" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    "questionType" TEXT NOT NULL DEFAULT '',
    "mistakeCount" INTEGER NOT NULL DEFAULT 1,
    "lastMistakeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrammarMistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIGenerationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grammarTopicId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedGrammarQuestion_grammarTopicId_status_idx" ON "GeneratedGrammarQuestion"("grammarTopicId", "status");

-- CreateIndex
CREATE INDEX "GeneratedGrammarQuestion_userId_grammarTopicId_status_idx" ON "GeneratedGrammarQuestion"("userId", "grammarTopicId", "status");

-- CreateIndex
CREATE INDEX "GrammarMistake_userId_status_idx" ON "GrammarMistake"("userId", "status");

-- CreateIndex
CREATE INDEX "GrammarMistake_userId_grammarTopicId_idx" ON "GrammarMistake"("userId", "grammarTopicId");

-- CreateIndex
CREATE INDEX "AIGenerationLog_userId_createdAt_idx" ON "AIGenerationLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "GeneratedGrammarQuestion" ADD CONSTRAINT "GeneratedGrammarQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedGrammarQuestion" ADD CONSTRAINT "GeneratedGrammarQuestion_grammarTopicId_fkey" FOREIGN KEY ("grammarTopicId") REFERENCES "GrammarTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarMistake" ADD CONSTRAINT "GrammarMistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarMistake" ADD CONSTRAINT "GrammarMistake_grammarTopicId_fkey" FOREIGN KEY ("grammarTopicId") REFERENCES "GrammarTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarMistake" ADD CONSTRAINT "GrammarMistake_generatedQuestionId_fkey" FOREIGN KEY ("generatedQuestionId") REFERENCES "GeneratedGrammarQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGenerationLog" ADD CONSTRAINT "AIGenerationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
