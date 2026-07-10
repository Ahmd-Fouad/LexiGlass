// Writing-practice analytics for the Progress page.
//
// Pure module (no DB access) so it can be unit-tested; lib/learning-data.ts
// fetches the user-scoped WritingAttempt rows and calls buildWritingStats.
// Everything is derived from the stored `score` plus the `feedback` and
// `promptWords` JSON that POST /api/writing/attempts already saves — no
// schema changes. Malformed/legacy JSON is tolerated (fields just count as
// empty), so old rows can never break the stats page.

const DAY_MS = 24 * 60 * 60 * 1000;

/** WritingAttempt subset (feedback/promptWords arrive as stored JSON). */
export interface WritingAttemptRow {
  mode: string;
  score: number;
  createdAt: Date;
  feedback: unknown;
  promptWords: unknown;
}

export interface MissedTargetCount {
  text: string;
  count: number;
}

export interface RecentWritingAttempt {
  mode: string;
  score: number;
  createdAt: Date;
  wordCount: number;
  targetCount: number;
  usedCount: number;
}

export type WritingTrend = "improving" | "steady" | "declining";

export interface WritingStats {
  totalAttempts: number;
  /** Mean score 0–100 (0 when there are no attempts). */
  averageScore: number;
  bestScore: number;
  last7Days: number;
  last30Days: number;
  /** Older-half vs newer-half score comparison; null until enough attempts. */
  trend: WritingTrend | null;
  /** Target words/phrases most often missing or incomplete, worst first. */
  mostMissedTargets: MissedTargetCount[];
  /** Newest first. */
  recent: RecentWritingAttempt[];
}

export const TREND_MIN_ATTEMPTS = 4;
const TREND_DELTA = 5; // score points the halves must differ by to call a trend
const RECENT_LIMIT = 5;
const MISSED_LIMIT = 6;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function field(json: unknown, key: string): unknown {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return undefined;
  return (json as Record<string, unknown>)[key];
}

function average(scores: number[]): number {
  return scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;
}

export interface WritingStatsOptions {
  now?: Date;
  recentLimit?: number;
  missedLimit?: number;
}

/**
 * Aggregates the given (already user-scoped) writing attempts into the
 * Progress-page stats. Rows may arrive in any order.
 */
export function buildWritingStats(
  rows: WritingAttemptRow[],
  options: WritingStatsOptions = {}
): WritingStats {
  const { now = new Date(), recentLimit = RECENT_LIMIT, missedLimit = MISSED_LIMIT } = options;
  const byOldest = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const byNewest = [...byOldest].reverse();

  const scores = byOldest.map((r) => r.score);
  const since7 = now.getTime() - 7 * DAY_MS;
  const since30 = now.getTime() - 30 * DAY_MS;

  // Trend: does the newer half score better than the older half?
  let trend: WritingTrend | null = null;
  if (scores.length >= TREND_MIN_ATTEMPTS) {
    const half = Math.floor(scores.length / 2);
    const diff = average(scores.slice(half)) - average(scores.slice(0, half));
    trend = diff >= TREND_DELTA ? "improving" : diff <= -TREND_DELTA ? "declining" : "steady";
  }

  // Targets that keep going missing or incomplete across attempts.
  const missed = new Map<string, { text: string; count: number }>();
  for (const row of rows) {
    const problem = [
      ...asStringArray(field(row.feedback, "missingTargets")),
      ...asStringArray(field(row.feedback, "incompleteTargets")),
    ];
    for (const text of problem) {
      const key = text.trim().toLowerCase();
      if (!key) continue;
      const entry = missed.get(key) ?? { text: text.trim(), count: 0 };
      entry.count++;
      missed.set(key, entry);
    }
  }

  const recent: RecentWritingAttempt[] = byNewest.slice(0, recentLimit).map((row) => {
    const wordCount = field(row.feedback, "wordCount");
    const promptWords = row.promptWords;
    return {
      mode: row.mode,
      score: row.score,
      createdAt: row.createdAt,
      wordCount: typeof wordCount === "number" ? wordCount : 0,
      targetCount: Array.isArray(promptWords) ? promptWords.length : 0,
      usedCount: asStringArray(field(row.feedback, "usedTargets")).length,
    };
  });

  return {
    totalAttempts: rows.length,
    averageScore: Math.round(average(scores)),
    bestScore: scores.length ? Math.max(...scores) : 0,
    last7Days: rows.filter((r) => r.createdAt.getTime() >= since7).length,
    last30Days: rows.filter((r) => r.createdAt.getTime() >= since30).length,
    trend,
    mostMissedTargets: [...missed.values()]
      .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
      .slice(0, missedLimit),
    recent,
  };
}
