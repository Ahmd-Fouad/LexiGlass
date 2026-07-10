import { expect, type Page, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const PASSWORD = "playwright-mistake-bank";

test.afterAll(async () => {
  await db.$disconnect();
});

test("Mistake Bank practice and resolve lifecycle", async ({ page }) => {
  const email = `mistake-bank-e2e-${Date.now()}@lexiglass.test`;

  await db.user.deleteMany({ where: { email } });
  const fixture = await createMistakeBankFixture(email);

  try {
    await login(page, email);
    await page.goto("/mistakes");

    const practiceCard = page.getByTestId(`grammar-mistake-record-${fixture.practiceMistakeId}`);
    const resolveCard = page.getByTestId(`grammar-mistake-record-${fixture.resolveMistakeId}`);
    const historicalResolvedCard = page.getByTestId(
      `grammar-mistake-record-${fixture.historicalResolvedMistakeId}`
    );

    await expect(page.getByRole("heading", { name: "Mistake Bank" })).toBeVisible();
    await expect(page.getByTestId("grammar-mistake-filter-active")).toContainText("active 2");
    await expect(practiceCard).toBeVisible();
    await expect(resolveCard).toBeVisible();
    await expect(historicalResolvedCard).toHaveCount(0);
    await expect(page.getByText("E2E Legacy QuizAnswer Topic")).toBeVisible();

    await practiceCard.getByRole("button", { name: "Practice this mistake" }).click();
    await practiceCard.getByTestId(`grammar-mistake-choice-${fixture.practiceMistakeId}-go`).click();
    await expect(practiceCard).toContainText('Not quite. Correct answer: "goes"');
    await expect(practiceCard).toContainText("2 misses");
    await expectMistake(fixture.practiceMistakeId, {
      status: "active",
      mistakeCount: 2,
      practicedAtSet: false,
    });

    await practiceCard.getByTestId(`grammar-mistake-choice-${fixture.practiceMistakeId}-goes`).click();
    await expect(practiceCard).toHaveCount(0);
    await expectMistake(fixture.practiceMistakeId, {
      status: "practiced",
      mistakeCount: 2,
      practicedAtSet: true,
    });

    await page.getByTestId("grammar-mistake-filter-practiced").click();
    await expect(practiceCard).toBeVisible();
    await expect(practiceCard).toContainText("practiced");

    await page.getByTestId("grammar-mistake-filter-active").click();
    await resolveCard.getByRole("button", { name: "Mark resolved" }).click();
    await resolveCard.getByRole("button", { name: "Confirm" }).click();
    await expect(resolveCard).toHaveCount(0);
    await expectMistake(fixture.resolveMistakeId, {
      status: "resolved",
      mistakeCount: 2,
      resolvedAtSet: true,
    });

    await expect(page.getByTestId("grammar-mistake-filter-active")).toContainText("active 0");
    await expect(page.getByText("E2E Legacy QuizAnswer Topic")).toBeVisible();

    await page.getByTestId("grammar-mistake-filter-resolved").click();
    await expect(resolveCard).toBeVisible();
    await expect(resolveCard).toContainText("resolved");
    await expect(historicalResolvedCard).toBeVisible();
    await expect(historicalResolvedCard).toContainText("resolved");
  } finally {
    await db.user.deleteMany({ where: { email } });
  }
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function createMistakeBankFixture(email: string) {
  const user = await db.user.create({
    data: {
      email,
      name: "Mistake Bank E2E",
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    },
  });

  const practiceTopic = await db.grammarTopic.create({
    data: {
      userId: user.id,
      title: "E2E Subject Verb Agreement",
      explanation: "Use -s with third-person singular present simple verbs.",
      examples: "She goes to school every day.\nHe works on Fridays.",
      commonMistakes: "She go to school. => She goes to school.",
      tags: "e2e,agreement",
      difficulty: "medium",
    },
  });
  const practiceQuestion = await db.generatedGrammarQuestion.create({
    data: {
      userId: user.id,
      grammarTopicId: practiceTopic.id,
      provider: "local",
      model: "local-rule-based",
      sourceHash: "e2e-practice",
      questionType: "choose_correct",
      question: "E2E practice fixture: Choose the correct verb: She ___ to school every day.",
      choices: ["go", "goes", "went", "gone"],
      correctAnswer: "goes",
      explanation: "Third-person singular subjects take -s in the present simple.",
      difficulty: "medium",
      source: "local",
      status: "active",
      qualityScore: 0.9,
    },
  });
  const practiceMistake = await db.grammarMistake.create({
    data: {
      userId: user.id,
      grammarTopicId: practiceTopic.id,
      generatedQuestionId: practiceQuestion.id,
      question: practiceQuestion.question,
      userAnswer: "go",
      correctAnswer: "goes",
      explanation: practiceQuestion.explanation,
      questionType: practiceQuestion.questionType,
      status: "active",
      mistakeCount: 1,
    },
  });

  const resolveTopic = await db.grammarTopic.create({
    data: {
      userId: user.id,
      title: "E2E Articles",
      explanation: "Use an before vowel sounds.",
      examples: "She waited for an hour.\nHe bought a laptop.",
      commonMistakes: "A hour => An hour.",
      tags: "e2e,articles",
      difficulty: "medium",
    },
  });
  const resolveQuestion = await db.generatedGrammarQuestion.create({
    data: {
      userId: user.id,
      grammarTopicId: resolveTopic.id,
      provider: "local",
      model: "local-rule-based",
      sourceHash: "e2e-resolve",
      questionType: "choose_correct",
      question: "E2E resolve fixture: Choose the correct article: She waited for ___ hour.",
      choices: ["a", "an", "the", "no article"],
      correctAnswer: "an",
      explanation: "Use an before the vowel sound in hour.",
      difficulty: "medium",
      source: "local",
      status: "active",
      qualityScore: 0.9,
    },
  });
  const resolveMistake = await db.grammarMistake.create({
    data: {
      userId: user.id,
      grammarTopicId: resolveTopic.id,
      generatedQuestionId: resolveQuestion.id,
      question: resolveQuestion.question,
      userAnswer: "a",
      correctAnswer: "an",
      explanation: resolveQuestion.explanation,
      questionType: resolveQuestion.questionType,
      status: "active",
      mistakeCount: 2,
    },
  });

  const historicalResolvedMistake = await db.grammarMistake.create({
    data: {
      userId: user.id,
      grammarTopicId: resolveTopic.id,
      question: "E2E historical fixture: This mistake was already resolved.",
      userAnswer: "old wrong",
      correctAnswer: "old right",
      explanation: "Resolved mistakes stay in history.",
      questionType: "correct_mistake",
      status: "resolved",
      resolvedAt: new Date(),
      mistakeCount: 3,
    },
  });

  const legacyTopic = await db.grammarTopic.create({
    data: {
      userId: user.id,
      title: "E2E Legacy QuizAnswer Topic",
      explanation: "A topic-level mistake built from QuizAnswer rows only.",
      examples: "I have visited Japan twice.\nI saw him yesterday.",
      commonMistakes: "I have seen him yesterday. => I saw him yesterday.",
      tags: "e2e,legacy",
      difficulty: "hard",
    },
  });
  const session = await db.quizSession.create({
    data: {
      userId: user.id,
      type: "grammar",
      totalQuestions: 2,
      correctCount: 1,
      finishedAt: new Date(),
    },
  });
  await db.quizAnswer.createMany({
    data: [
      {
        sessionId: session.id,
        grammarTopicId: legacyTopic.id,
        questionType: "mcq",
        question: "E2E legacy fixture: Which sentence is correct?",
        correctAnswer: "I saw him yesterday.",
        userAnswer: "I have seen him yesterday.",
        isCorrect: false,
      },
      {
        sessionId: session.id,
        grammarTopicId: legacyTopic.id,
        questionType: "mcq",
        question: "E2E legacy fixture: Choose the experience sentence.",
        correctAnswer: "I have visited Japan twice.",
        userAnswer: "I have visited Japan twice.",
        isCorrect: true,
      },
    ],
  });

  return {
    practiceMistakeId: practiceMistake.id,
    resolveMistakeId: resolveMistake.id,
    historicalResolvedMistakeId: historicalResolvedMistake.id,
  };
}

async function expectMistake(
  id: string,
  expected: {
    status: string;
    mistakeCount: number;
    practicedAtSet?: boolean;
    resolvedAtSet?: boolean;
  }
) {
  const row = await db.grammarMistake.findUnique({ where: { id } });
  expect(row).not.toBeNull();
  expect(row?.status).toBe(expected.status);
  expect(row?.mistakeCount).toBe(expected.mistakeCount);
  if (expected.practicedAtSet !== undefined) {
    expect(Boolean(row?.practicedAt)).toBe(expected.practicedAtSet);
  }
  if (expected.resolvedAtSet !== undefined) {
    expect(Boolean(row?.resolvedAt)).toBe(expected.resolvedAtSet);
  }
}
