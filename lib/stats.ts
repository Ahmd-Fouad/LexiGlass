import { db } from "./db";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

/** Consecutive study days ending today or yesterday. */
export function computeStreak(reviewDates: Date[]): number {
  const days = new Set(reviewDates.map(dayKey));
  if (days.size === 0) return 0;

  let streak = 0;
  let cursor = startOfDay(new Date());
  // The streak survives if the user hasn't studied *yet* today.
  if (!days.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);

  while (days.has(dayKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}

export interface DashboardStats {
  totalWords: number;
  totalPhrases: number;
  totalGrammar: number;
  dueToday: number;
  weeklyReviews: number;
  accuracy: number; // 0-100, all-time
  streak: number;
  masteredCount: number;
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [totalWords, totalPhrases, totalGrammar, dueToday, weeklyReviews, reviewLogs, cards] =
    await Promise.all([
      db.flashcard.count({ where: { userId, kind: "word" } }),
      db.flashcard.count({ where: { userId, kind: "phrase" } }),
      db.grammarTopic.count({ where: { userId } }),
      db.flashcard.count({ where: { userId, dueDate: { lte: now } } }),
      db.reviewLog.count({ where: { userId, reviewedAt: { gte: weekAgo } } }),
      db.reviewLog.findMany({
        where: { userId },
        select: { reviewedAt: true, wasCorrect: true },
      }),
      db.flashcard.findMany({
        where: { userId },
        select: { reviewCount: true, correctCount: true, intervalDays: true },
      }),
    ]);

  const totalReviews = reviewLogs.length;
  const correctReviews = reviewLogs.filter((r) => r.wasCorrect).length;
  const masteredCount = cards.filter(
    (c) => c.reviewCount >= 4 && c.correctCount / Math.max(1, c.reviewCount) >= 0.8 && c.intervalDays >= 5
  ).length;

  return {
    totalWords,
    totalPhrases,
    totalGrammar,
    dueToday,
    weeklyReviews,
    accuracy: totalReviews === 0 ? 0 : Math.round((correctReviews / totalReviews) * 100),
    streak: computeStreak(reviewLogs.map((r) => r.reviewedAt)),
    masteredCount,
  };
}

export interface DailyCount {
  date: string; // "Mon 3"
  total: number;
  correct: number;
}

export async function getProgressStats(userId: string) {
  const now = new Date();
  const twoWeeksAgo = new Date(startOfDay(now).getTime() - 13 * DAY_MS);

  const [allLogs, cards, quizzes] = await Promise.all([
    db.reviewLog.findMany({
      where: { userId },
      select: { reviewedAt: true, wasCorrect: true },
      orderBy: { reviewedAt: "asc" },
    }),
    db.flashcard.findMany({ where: { userId } }),
    db.quizSession.findMany({
      where: { userId, finishedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 15,
    }),
  ]);

  // The 14-day window is a subset of allLogs — no second query needed.
  const logs = allLogs.filter((l) => l.reviewedAt >= twoWeeksAgo);

  // Reviews per day for the last 14 days.
  const daily: DailyCount[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(startOfDay(now).getTime() - i * DAY_MS);
    const key = dayKey(day);
    const dayLogs = logs.filter((l) => dayKey(l.reviewedAt) === key);
    daily.push({
      date: day.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
      total: dayLogs.length,
      correct: dayLogs.filter((l) => l.wasCorrect).length,
    });
  }

  // Accuracy per week over the last 6 weeks.
  const weekly: { label: string; accuracy: number; total: number }[] = [];
  for (let w = 5; w >= 0; w--) {
    const start = new Date(startOfDay(now).getTime() - (w * 7 + 6) * DAY_MS);
    const end = new Date(startOfDay(now).getTime() - (w * 7 - 1) * DAY_MS);
    const weekLogs = allLogs.filter((l) => l.reviewedAt >= start && l.reviewedAt < end);
    weekly.push({
      label: w === 0 ? "This week" : `${w}w ago`,
      accuracy: weekLogs.length ? Math.round((weekLogs.filter((l) => l.wasCorrect).length / weekLogs.length) * 100) : 0,
      total: weekLogs.length,
    });
  }

  const withAccuracy = cards
    .filter((c) => c.reviewCount >= 2)
    .map((c) => ({ ...c, acc: c.correctCount / Math.max(1, c.reviewCount) }));

  const hardestWords = [...withAccuracy]
    .sort((a, b) => a.acc - b.acc || b.incorrectCount - a.incorrectCount)
    .slice(0, 8)
    .map((c) => ({ id: c.id, text: c.text, meaning: c.meaning, accuracy: Math.round(c.acc * 100), incorrect: c.incorrectCount }));

  const mastered = withAccuracy.filter((c) => c.reviewCount >= 4 && c.acc >= 0.8 && c.intervalDays >= 5);

  return {
    daily,
    weekly,
    hardestWords,
    masteredCount: mastered.length,
    totalCards: cards.length,
    streak: computeStreak(allLogs.map((l) => l.reviewedAt)),
    totalReviews: allLogs.length,
    allTimeAccuracy: allLogs.length
      ? Math.round((allLogs.filter((l) => l.wasCorrect).length / allLogs.length) * 100)
      : 0,
    quizzes: quizzes.map((q) => ({
      id: q.id,
      type: q.type,
      total: q.totalQuestions,
      correct: q.correctCount,
      date: q.startedAt.toISOString(),
    })),
  };
}
