import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { getProgressStats } from "@/lib/stats";
import { getWeaknessData } from "@/lib/learning-data";
import {
  accuracyByDifficulty,
  accuracyByQuestionType,
  classifyCards,
  dueBuckets,
  mostRepeatedMistakes,
  weakestTags,
  type AccuracyBucket,
} from "@/lib/analytics";
import { Chip, EmptyState, GlassCard, LinkButton } from "@/components/ui";
import { AccuracyLineChart, DailyReviewsChart } from "@/components/stats/Charts";
import { formatDate } from "@/lib/client";

export const metadata = { title: "Progress — LexiGlass" };

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
      {children}
    </GlassCard>
  );
}

/** Horizontal accuracy bar with label and counts. */
function AccuracyBar({ bucket }: { bucket: AccuracyBucket }) {
  const tone =
    bucket.accuracy >= 75 ? "bg-teal-glow" : bucket.accuracy >= 50 ? "bg-amber-400" : "bg-rose-glow";
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="capitalize">{bucket.label}</span>
        <span className="text-xs tabular-nums text-ink-muted">
          {bucket.accuracy}% · {bucket.correct}/{bucket.total}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${bucket.accuracy}%` }} />
      </div>
    </div>
  );
}

export default async function StatsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const [stats, weakness] = await Promise.all([getProgressStats(userId), getWeaknessData(userId)]);

  const states = classifyCards(weakness.cards);
  const due = dueBuckets(weakness.cards);
  const byDifficulty = accuracyByDifficulty(weakness.cards).filter((b) => b.total > 0);
  const byType = accuracyByQuestionType(weakness.quizAnswers);
  const tags = weakestTags(weakness.cards, weakness.vocabMistakes);
  const weakGrammar = weakness.grammarMistakes.slice(0, 6);
  const repeated = mostRepeatedMistakes(weakness.vocabMistakes, weakness.grammarMistakes, 8);
  const weakestWords = weakness.vocabMistakes.slice(0, 8);

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
        <p className="mt-1 text-sm text-ink-muted">
          How your studying is going — and exactly where to aim next.
        </p>
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
            <SectionCard title="Daily reviews · last 14 days">
              <DailyReviewsChart data={stats.daily} />
            </SectionCard>
            <SectionCard title="Accuracy · last 6 weeks">
              <AccuracyLineChart data={stats.weekly} />
            </SectionCard>
          </section>

          {/* Card status + upcoming reviews */}
          <section className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Card status">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Mastered", value: states.mastered, tone: "text-teal-200" },
                  { label: "Learning", value: states.learning, tone: "text-violet-200" },
                  { label: "Weak", value: states.weak, tone: "text-rose-200" },
                  { label: "New", value: states.new, tone: "text-ink-muted" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-white/5 px-3 py-3 text-center">
                    <p className={`text-2xl font-semibold tabular-nums ${s.tone}`}>{s.value}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{s.label}</p>
                  </div>
                ))}
              </div>
              {states.weak > 0 && (
                <div className="mt-4">
                  <LinkButton href="/review?mode=weak" variant="ghost" className="!px-3.5 !py-1.5 !text-xs">
                    Review {states.weak} weak {states.weak === 1 ? "card" : "cards"}
                  </LinkButton>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Cards due soon">
              <ul className="space-y-2 text-sm">
                {[
                  { label: "Due today", value: due.today },
                  { label: "Due tomorrow", value: due.tomorrow },
                  { label: "Later this week", value: due.thisWeek },
                ].map((row) => (
                  <li key={row.label} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2.5">
                    <span>{row.label}</span>
                    <span className="font-semibold tabular-nums">{row.value}</span>
                  </li>
                ))}
              </ul>
              {due.today > 0 && (
                <div className="mt-4">
                  <LinkButton href="/review" variant="ghost" className="!px-3.5 !py-1.5 !text-xs">
                    Review now
                  </LinkButton>
                </div>
              )}
            </SectionCard>
          </section>

          {/* Accuracy breakdowns */}
          {(byDifficulty.length > 0 || byType.length > 0) && (
            <section className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Accuracy by difficulty">
                {byDifficulty.length === 0 ? (
                  <p className="text-sm text-ink-muted">Review a few cards first.</p>
                ) : (
                  byDifficulty.map((b) => <AccuracyBar key={b.label} bucket={b} />)
                )}
              </SectionCard>
              <SectionCard title="Accuracy by question type">
                {byType.length === 0 ? (
                  <p className="text-sm text-ink-muted">Take a quiz to see which question types trip you up.</p>
                ) : (
                  byType.map((b) => <AccuracyBar key={b.label} bucket={b} />)
                )}
              </SectionCard>
            </section>
          )}

          {/* Weak spots */}
          <section className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Weakest words & phrases">
              {weakestWords.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Nothing weak right now — quizzes and reviews will surface trouble words here.
                </p>
              ) : (
                <ul className="divide-y divide-white/8">
                  {weakestWords.map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{w.title}</p>
                        <p className="truncate text-xs text-ink-muted">{w.meaning}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {w.accuracy !== null && (
                          <Chip tone={w.accuracy < 50 ? "rose" : "amber"}>{w.accuracy}%</Chip>
                        )}
                        <LinkButton
                          href={`/cards/${w.id}/edit`}
                          variant="ghost"
                          className="!px-2.5 !py-1 !text-xs"
                        >
                          Open
                        </LinkButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {weakestWords.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <LinkButton href="/review?mode=weak" variant="ghost" className="!px-3.5 !py-1.5 !text-xs">
                    Review weak words
                  </LinkButton>
                  <LinkButton href="/quiz/vocab?mode=weak" variant="ghost" className="!px-3.5 !py-1.5 !text-xs">
                    Quiz weak words
                  </LinkButton>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Weakest grammar topics">
              {weakGrammar.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No grammar trouble spots yet. Take a grammar quiz to find out where you stand.
                </p>
              ) : (
                <ul className="divide-y divide-white/8">
                  {weakGrammar.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.title}</p>
                        <p className="text-xs text-ink-muted">
                          {t.wrong} wrong of {t.total} answered
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Chip tone={t.accuracy < 50 ? "rose" : "amber"}>{t.accuracy}%</Chip>
                        <LinkButton
                          href={`/grammar/${t.id}/edit`}
                          variant="ghost"
                          className="!px-2.5 !py-1 !text-xs"
                        >
                          Open
                        </LinkButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {weakGrammar.length > 0 && (
                <div className="mt-4">
                  <LinkButton href="/quiz/grammar" variant="ghost" className="!px-3.5 !py-1.5 !text-xs">
                    Practice grammar quiz
                  </LinkButton>
                </div>
              )}
            </SectionCard>
          </section>

          {/* Weak tags + repeated mistakes */}
          <section className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Weakest tags">
              {tags.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Tag your cards (e.g. “travel”, “work”) to see which topics need attention.
                </p>
              ) : (
                <ul className="divide-y divide-white/8">
                  {tags.map((t) => (
                    <li key={t.tag} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.tag}</p>
                        <p className="text-xs text-ink-muted">
                          {t.cards} {t.cards === 1 ? "card" : "cards"}
                          {t.mistakes > 0 && ` · ${t.mistakes} recent ${t.mistakes === 1 ? "miss" : "misses"}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Chip tone={t.accuracy < 50 ? "rose" : t.accuracy < 75 ? "amber" : "teal"}>
                          {t.accuracy}%
                        </Chip>
                        <LinkButton
                          href={`/quiz/vocab?tag=${encodeURIComponent(t.tag)}`}
                          variant="ghost"
                          className="!px-2.5 !py-1 !text-xs"
                        >
                          Quiz
                        </LinkButton>
                        <LinkButton
                          href={`/review?tag=${encodeURIComponent(t.tag)}`}
                          variant="ghost"
                          className="!px-2.5 !py-1 !text-xs"
                        >
                          Review
                        </LinkButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Most repeated mistakes">
              {repeated.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No repeat offenders — mistakes you make more than once will show up here.
                </p>
              ) : (
                <ul className="divide-y divide-white/8">
                  {repeated.map((m) => (
                    <li key={`${m.type}_${m.id}`} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{m.title}</p>
                        <p className="text-xs text-ink-muted capitalize">{m.type === "vocab" ? m.kind : "grammar"}</p>
                      </div>
                      <Chip tone="rose">
                        {m.type === "vocab" ? m.mistakeCount + m.lapses : m.wrong}× missed
                      </Chip>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <LinkButton href="/mistakes" variant="ghost" className="!px-3.5 !py-1.5 !text-xs">
                  Open Mistake Bank
                </LinkButton>
              </div>
            </SectionCard>
          </section>

          {/* Quiz history */}
          <section>
            <SectionCard title="Quiz history">
              {stats.quizzes.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No finished quizzes yet.{" "}
                  <LinkButton href="/quiz/vocab" variant="ghost" className="!px-3 !py-1 !text-xs">Take one</LinkButton>
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
            </SectionCard>
          </section>
        </>
      )}
    </main>
  );
}
