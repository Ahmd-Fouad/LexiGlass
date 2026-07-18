import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";

const enabled = process.env.RUN_DB_INTEGRATION === "1";
const db = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const emails = [`owner-${suffix}@example.test`, `other-${suffix}@example.test`];

after(async () => {
  if (enabled) await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});

describe("PostgreSQL ownership and idempotency invariants", { skip: !enabled }, () => {
  it("enforces ownership queries, unique actions, unique answers, and rollback", async () => {
    const [owner, other] = await Promise.all(emails.map((email, index) => db.user.create({
      data: { email, name: index ? "Other" : "Owner", passwordHash: "integration-only" },
    })));
    const card = await db.flashcard.create({
      data: { userId: owner.id, text: "durable", meaning: "able to last" },
    });

    assert.equal(await db.flashcard.findFirst({ where: { id: card.id, userId: other.id } }), null);
    assert.equal((await db.flashcard.findFirst({ where: { id: card.id, userId: owner.id } }))?.id, card.id);

    const review = {
      userId: owner.id,
      flashcardId: card.id,
      rating: "good",
      clientActionId: `action-${suffix}`,
      wasCorrect: true,
      intervalBefore: 0,
      intervalAfter: 1,
    };
    await db.reviewLog.create({ data: review });
    await assert.rejects(db.reviewLog.create({ data: review }), (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
    );

    const session = await db.quizSession.create({
      data: {
        userId: owner.id,
        type: "vocab",
        totalQuestions: 1,
        questions: { create: { orderIndex: 0, questionType: "mcq_meaning", prompt: "Meaning?", correctAnswer: card.meaning, flashcardId: card.id } },
      },
      include: { questions: true },
    });
    const answer = {
      sessionId: session.id,
      quizQuestionId: session.questions[0].id,
      submissionId: `submission-${suffix}`,
      flashcardId: card.id,
      questionType: "mcq_meaning",
      question: "Meaning?",
      correctAnswer: card.meaning,
      userAnswer: card.meaning,
      isCorrect: true,
    };
    await db.quizAnswer.create({ data: answer });
    await assert.rejects(db.quizAnswer.create({ data: { ...answer, submissionId: `second-${suffix}` } }));

    await assert.rejects(db.$transaction(async (tx) => {
      await tx.flashcard.update({ where: { id: card.id }, data: { meaning: "must roll back" } });
      await tx.quizAnswer.create({ data: answer });
    }));
    assert.equal((await db.flashcard.findUniqueOrThrow({ where: { id: card.id } })).meaning, card.meaning);
  });
});
