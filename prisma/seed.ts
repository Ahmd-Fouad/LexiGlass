// Seeds a demo account so the app can be explored immediately:
//   email: demo@lexiglass.app   password: demo1234
// Safe to re-run: it deletes and recreates the demo user only.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY);
const daysFromNow = (n: number) => new Date(now + n * DAY);

const cards = [
  // text, kind, meaning, translation, example, wordType, difficulty, tags, interval, dueInDays, reviews, correct, incorrect
  ["meticulous", "word", "very careful and precise about details", "دقيق جداً", "She kept meticulous records of every expense.", "adjective", "hard", "personality,work", 2, -1, 5, 3, 2],
  ["resilient", "word", "able to recover quickly from difficulties", "مرن، قادر على التعافي", "Children are often more resilient than adults expect.", "adjective", "medium", "personality", 3, 0, 4, 3, 1],
  ["procrastinate", "word", "to delay doing something that you should do", "يماطل، يؤجل", "I always procrastinate when I have to write reports.", "verb", "medium", "habits,study", 1, -2, 6, 4, 2],
  ["ambiguous", "word", "having more than one possible meaning; unclear", "غامض", "His answer was ambiguous, so nobody knew what he really meant.", "adjective", "hard", "communication", 0.5, -1, 3, 1, 2],
  ["thrive", "word", "to grow, develop, or be successful", "يزدهر", "Some plants thrive in cold weather.", "verb", "easy", "nature,success", 5, 2, 4, 4, 0],
  ["reluctant", "word", "not willing to do something", "متردد", "He was reluctant to admit his mistake.", "adjective", "medium", "personality", 2, -3, 5, 3, 2],
  ["deteriorate", "word", "to become progressively worse", "يتدهور", "Her health began to deteriorate last winter.", "verb", "hard", "health", 1, 0, 2, 1, 1],
  ["genuine", "word", "real and exactly what it appears to be; sincere", "حقيقي، صادق", "She showed genuine concern for the patients.", "adjective", "easy", "personality", 6, 3, 5, 5, 0],
  ["inevitable", "word", "certain to happen; unavoidable", "حتمي", "Change is inevitable in any growing company.", "adjective", "medium", "abstract", 3, 1, 3, 2, 1],
  ["subtle", "word", "not obvious; delicate or precise", "دقيق، غير واضح", "There is a subtle difference between the two colors.", "adjective", "hard", "description", 0.5, -2, 4, 1, 3],
  ["comprehensive", "word", "complete and including everything necessary", "شامل", "The report gives a comprehensive overview of the market.", "adjective", "medium", "work,study", 4, 2, 3, 3, 0],
  ["diligent", "word", "working hard with care and effort", "مجتهد", "She is a diligent student who never misses a class.", "adjective", "easy", "study,personality", 5, 4, 4, 4, 0],
  ["break the ice", "phrase", "to make people feel more comfortable in a social situation", "كسر الجليد / بدء الحديث", "He told a joke to break the ice at the meeting.", "idiom", "easy", "idioms,social", 4, 1, 3, 3, 0],
  ["on the fence", "phrase", "undecided about something", "متردد، لم يحسم قراره", "I'm still on the fence about changing jobs.", "idiom", "medium", "idioms,decisions", 2, -1, 4, 2, 2],
  ["once in a blue moon", "phrase", "very rarely", "نادراً جداً", "We only eat out once in a blue moon.", "idiom", "easy", "idioms,time", 6, 3, 2, 2, 0],
  ["get the hang of", "phrase", "to learn how to do something", "يتقن، يعتاد على", "It took me a week to get the hang of the new software.", "idiom", "medium", "idioms,learning", 1, -2, 5, 3, 2],
  ["under the weather", "phrase", "feeling slightly ill", "متوعك، مريض قليلاً", "I'm feeling a bit under the weather today.", "idiom", "easy", "idioms,health", 5, 2, 3, 3, 0],
  ["in the long run", "phrase", "over a long period of time in the future", "على المدى الطويل", "Exercise pays off in the long run.", "phrase", "medium", "time,planning", 3, 0, 3, 2, 1],
  ["cut corners", "phrase", "to do something badly to save time or money", "يستسهل / يقصر في العمل", "Don't cut corners when it comes to safety.", "idiom", "hard", "idioms,work", 0.5, -1, 3, 1, 2],
  ["come across", "phrase", "to find or meet by chance", "يصادف", "I came across an old photo while cleaning my desk.", "phrase", "medium", "phrasal verbs", 2, -4, 4, 2, 2],
  ["look forward to", "phrase", "to feel excited about something that is going to happen", "يتطلع إلى", "I look forward to hearing from you.", "phrase", "easy", "phrasal verbs,email", 5, 3, 4, 4, 0],
  ["figure out", "phrase", "to understand or solve something", "يكتشف، يحل", "I can't figure out how to open this file.", "phrase", "easy", "phrasal verbs", 4, 1, 5, 4, 1],
] as const;

const topics = [
  {
    title: "Present Perfect vs Past Simple",
    explanation:
      "Use the past simple for finished actions at a specific past time (yesterday, last week, in 2020). Use the present perfect for experiences, changes, or actions with a result in the present, when the exact time is not stated.",
    examples:
      "I have visited Japan twice.\nI visited Japan in 2019.\nShe has just finished her homework.\nThey lived in Cairo for five years before moving.",
    commonMistakes:
      "I have seen him yesterday. => I saw him yesterday.\nDid you ever eat sushi? => Have you ever eaten sushi?\nShe has went home. => She has gone home.",
    tags: "tenses,present perfect,past simple",
    difficulty: "hard",
  },
  {
    title: "Articles: a, an, the",
    explanation:
      "Use a/an for non-specific singular countable nouns (a book, an hour — choose by sound, not spelling). Use the for specific things both speakers know, and for unique things (the sun). Use no article for general plurals and uncountables (I like music).",
    examples:
      "She bought a new laptop.\nHe is an honest man.\nThe moon looks beautiful tonight.\nCats are independent animals.",
    commonMistakes:
      "I love the nature. => I love nature.\nHe is teacher. => He is a teacher.\nShe arrived after a hour. => She arrived after an hour.",
    tags: "articles,determiners",
    difficulty: "medium",
  },
  {
    title: "First and Second Conditionals",
    explanation:
      "First conditional (real future possibility): If + present simple, will + base verb — If it rains, we will stay home. Second conditional (imaginary present/future): If + past simple, would + base verb — If I were rich, I would travel.",
    examples:
      "If you study hard, you will pass the exam.\nIf I had more time, I would learn the piano.\nIf she calls, I will tell her the news.",
    commonMistakes:
      "If I will see him, I will tell him. => If I see him, I will tell him.\nIf I would have money, I would buy it. => If I had money, I would buy it.",
    tags: "conditionals,if clauses",
    difficulty: "hard",
  },
  {
    title: "Gerunds and Infinitives",
    explanation:
      "Some verbs are followed by a gerund (-ing): enjoy, finish, avoid, suggest, mind. Others are followed by to + infinitive: decide, want, hope, plan, agree. A few change meaning: stop smoking (quit) vs stop to smoke (pause in order to smoke).",
    examples:
      "I enjoy reading before bed.\nShe decided to move abroad.\nHe avoided answering the question.",
    commonMistakes:
      "I enjoy to read. => I enjoy reading.\nShe suggested to go early. => She suggested going early.",
    tags: "gerunds,infinitives,verb patterns",
    difficulty: "medium",
  },
];

async function main() {
  const email = "demo@lexiglass.app";
  await db.user.deleteMany({ where: { email } });

  const user = await db.user.create({
    data: {
      email,
      name: "Demo Learner",
      passwordHash: await bcrypt.hash("demo1234", 10),
    },
  });

  for (const [text, kind, meaning, translation, example, wordType, difficulty, tags, interval, dueIn, reviews, correct, incorrect] of cards) {
    const card = await db.flashcard.create({
      data: {
        userId: user.id,
        text, kind, meaning, translation, example, wordType, difficulty, tags,
        intervalDays: interval,
        dueDate: daysFromNow(dueIn),
        reviewCount: reviews,
        correctCount: correct,
        incorrectCount: incorrect,
        lapses: incorrect,
        easeFactor: 2.5 - incorrect * 0.15,
        lastReviewedAt: reviews > 0 ? daysAgo(Math.max(1, interval - dueIn)) : null,
        createdAt: daysAgo(14 + Math.random() * 20),
      },
    });

    // Review history spread over the last two weeks (feeds charts + streak).
    for (let r = 0; r < reviews; r++) {
      const wasCorrect = r < correct;
      await db.reviewLog.create({
        data: {
          userId: user.id,
          flashcardId: card.id,
          rating: wasCorrect ? (Math.random() < 0.3 ? "easy" : "good") : "again",
          wasCorrect,
          intervalBefore: Math.max(0, interval - 1),
          intervalAfter: interval,
          reviewedAt: daysAgo(Math.floor(Math.random() * 13)),
        },
      });
    }
  }

  for (const t of topics) {
    await db.grammarTopic.create({
      data: { userId: user.id, ...t, createdAt: daysAgo(10 + Math.random() * 15) },
    });
  }

  // A couple of finished quiz sessions for the history page.
  for (const [type, total, correctCount, d] of [["vocab", 20, 15, 3], ["grammar", 12, 9, 2], ["vocab", 20, 17, 1]] as const) {
    await db.quizSession.create({
      data: {
        userId: user.id,
        type,
        totalQuestions: total,
        correctCount,
        startedAt: daysAgo(d),
        finishedAt: daysAgo(d),
      },
    });
  }

  console.log("Seeded demo user: demo@lexiglass.app / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
