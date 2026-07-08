import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { getProgressStats } from "@/lib/stats";
import { Chip, EmptyState, GlassCard, LinkButton } from "@/components/ui";
import { AccuracyLineChart, DailyReviewsChart } from "@/components/stats/Charts";
import { formatDate } from "@/lib/client";

export const metadata = { title: "Progress — LexiGlass" };

export default async function StatsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const stats = await getProgressStats(userId);

  const tiles = [
    { label: "Day streak", value: stats.streak },
    { label: "Total reviews", value: stats.totalReviews },
    { label: "All-time accuracy", value: `${stats.allTimeAccuracy}%` },
    { label: "Words mastered", value: `${stats.masteredCount}/${stats.totalCards}` },
  ];

  return (
    <main className="rise-in space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Progress</h1>
        <p className="mt-1 text-sm text-ink-muted">How your studying is going, day by day.</p>
      </div>

      {stats.totalReviews === 0 && stats.quizzes.length === 0 ? (
        <EmptyState
          title="No progress to show yet"
          hint="Review a few cards or take a quiz, and your history will appear here."
          action={<LinkButton href="/review">Start reviewing</LinkButton>}
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Overview">
            {tiles.map((t) => (
              <GlassCard key={t.label} className="p-5">
                <p className="text-3xl font-semibold tabular-nums">{t.value}</p>
                <p className="mt-1 text-xs text-ink-muted">{t.label}</p>
              </GlassCard>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <GlassCard className="p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-muted">
                Daily reviews · last 14 days
              </h2>
              <DailyReviewsChart data={stats.daily} />
            </GlassCard>
            <GlassCard className="p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-muted">
                Accuracy · last 6 weeks
              </h2>
              <AccuracyLineChart data={stats.weekly} />
            </GlassCard>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <GlassCard className="p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-muted">
                Most difficult words
              </h2>
              {stats.hardestWords.length === 0 ? (
                <p className="text-sm text-ink-muted">Review more cards to see which ones give you trouble.</p>
              ) : (
                <ul className="divide-y divide-white/8">
                  {stats.hardestWords.map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{w.text}</p>
                        <p className="truncate text-xs text-ink-muted">{w.meaning}</p>
                      </div>
                      <Chip tone={w.accuracy < 50 ? "rose" : "amber"}>{w.accuracy}% right</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>

            <GlassCard className="p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-muted">
                Quiz history
              </h2>
              {stats.quizzes.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No finished quizzes yet. <LinkButton href="/quiz/vocab" variant="ghost" className="!px-3 !py-1 !text-xs">Take one</LinkButton>
                </p>
              ) : (
                <ul className="divide-y divide-white/8">
                  {stats.quizzes.map((q) => {
                    const pct = q.total ? Math.round((q.correct / q.total) * 100) : 0;
                    return (
                      <li key={q.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div>
                          <p className="font-medium capitalize">{q.type} quiz</p>
                          <p className="text-xs text-ink-muted">{formatDate(q.date)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm tabular-nums text-ink-muted">{q.correct}/{q.total}</span>
                          <Chip tone={pct >= 70 ? "teal" : pct >= 40 ? "amber" : "rose"}>{pct}%</Chip>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </GlassCard>
          </section>
        </>
      )}
    </main>
  );
}
