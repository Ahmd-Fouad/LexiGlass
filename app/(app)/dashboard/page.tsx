import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDashboardStats } from "@/lib/stats";
import { buildDailyStudyPlan } from "@/lib/learning-data";
import { isPlanDone, planMinutesLeft, type PlanItem } from "@/lib/study-plan";
import { Chip, GlassCard, LinkButton } from "@/components/ui";

export const metadata = { title: "Dashboard — LexiGlass" };

const STATUS_LABELS: Record<PlanItem["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

function DailyPlan({ items }: { items: PlanItem[] }) {
  const done = isPlanDone(items);
  const minutesLeft = planMinutesLeft(items);

  // When the plan has cards to work on, offer to turn them into active
  // writing/pronunciation practice (uses the same weak/mistakes/due target set).
  const practiceItem = items.find(
    (i) => ["weak", "mistakes", "due"].includes(i.id) && i.status !== "completed" && i.count > 0
  );
  const practiceMode = practiceItem?.id === "weak" ? "weak" : practiceItem?.id === "mistakes" ? "mistakes" : "due";

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Today&apos;s study plan
        </h2>
        {!done && minutesLeft > 0 && (
          <span className="text-xs text-ink-muted">~{minutesLeft} min left</span>
        )}
      </div>

      {done ? (
        <div className="mt-4 text-center">
          <p className="font-display text-2xl">You&apos;re done for today 🎉</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
            Everything on the plan is finished. Add new words, or come back tomorrow when the next cards are due.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <LinkButton href="/cards/new">+ Add words</LinkButton>
            <LinkButton href="/mistakes" variant="ghost">Open Mistake Bank</LinkButton>
          </div>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const completed = item.status === "completed";
            return (
              <li
                key={item.id}
                className={`flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between ${
                  completed ? "opacity-60" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span aria-hidden className={completed ? "text-teal-glow" : "text-ink-muted"}>
                      {completed ? "✓" : item.status === "in_progress" ? "◐" : "○"}
                    </span>
                    <p className={`font-medium ${completed ? "line-through decoration-white/30" : ""}`}>
                      {item.title}
                    </p>
                    {item.priority === "high" && !completed && <Chip tone="rose">priority</Chip>}
                    <Chip
                      tone={completed ? "teal" : item.status === "in_progress" ? "amber" : "neutral"}
                    >
                      {STATUS_LABELS[item.status]}
                    </Chip>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {item.reason}
                    {!completed && item.minutes > 0 && ` · ~${item.minutes} min`}
                  </p>
                </div>
                {!completed && (
                  <LinkButton
                    href={item.href}
                    variant={item.priority === "high" ? "primary" : "ghost"}
                    className="shrink-0 !px-4 !py-2 !text-xs"
                  >
                    {item.cta}
                  </LinkButton>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!done && practiceItem && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4 text-sm text-ink-muted">
          <span>Turn these into active practice:</span>
          <LinkButton href={`/writing?mode=${practiceMode}`} variant="ghost" className="!px-3 !py-1 !text-xs">
            ✍ Writing
          </LinkButton>
          <LinkButton href={`/pronunciation?mode=${practiceMode}`} variant="ghost" className="!px-3 !py-1 !text-xs">
            🔊 Pronunciation
          </LinkButton>
        </div>
      )}
    </GlassCard>
  );
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [stats, plan] = await Promise.all([
    getDashboardStats(user.id),
    buildDailyStudyPlan(user.id),
  ]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const tiles = [
    { label: "Words studied", value: stats.totalWords, href: "/cards?kind=word" },
    { label: "Phrases studied", value: stats.totalPhrases, href: "/cards?kind=phrase" },
    { label: "Grammar topics", value: stats.totalGrammar, href: "/grammar" },
    { label: "Reviews this week", value: stats.weeklyReviews, href: "/stats" },
    { label: "Accuracy", value: `${stats.accuracy}%`, href: "/stats" },
    { label: "Mastered", value: stats.masteredCount, href: "/stats" },
  ];
  const starterSteps = [
    { label: "Add your first card", href: "/cards/new", done: stats.totalWords + stats.totalPhrases > 0 },
    { label: "Complete your first review", href: "/review", done: stats.totalReviews > 0 },
    { label: "Try your first quiz", href: "/quiz/vocab", done: stats.totalQuizzes > 0 },
    { label: "View your progress", href: "/stats", done: false },
  ];
  const showStarterChecklist = starterSteps.slice(0, 3).some((step) => !step.done);

  // Active-practice cards, enriched from today's plan when possible.
  const writingItem = plan.find((i) => i.id === "writing");
  const writingDone = writingItem?.status === "completed";
  const practiceCards = [
    {
      icon: "✍",
      title: "Writing practice",
      description: "Use weak words in your own sentences.",
      hint: writingDone
        ? "Done for today ✓"
        : writingItem && writingItem.count > 0
          ? `${writingItem.count} target ${writingItem.count === 1 ? "word" : "words"} ready`
          : null,
      done: writingDone,
      href: writingItem && !writingDone ? writingItem.href : "/writing",
      cta: "Start writing",
    },
    {
      icon: "🔊",
      title: "Pronunciation",
      description: "Listen, repeat, and compare your speech.",
      hint: null,
      done: false,
      href: "/pronunciation",
      cta: "Practice pronunciation",
    },
    {
      icon: "▦",
      title: "Study collections",
      description: "Study by tag, difficulty, weakness, or due status.",
      hint: null,
      done: false,
      href: "/collections",
      cta: "Open collections",
    },
  ];

  return (
    <main className="rise-in space-y-6">
      {/* Hero: today's review ritual */}
      <GlassCard className="relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 select-none font-display text-[16rem] font-bold italic leading-none text-white/[0.04]"
        >
          Aa
        </div>
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-ink-muted">{greeting}, {user.name.split(" ")[0]}</p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              {stats.dueToday > 0 ? (
                <>
                  <span className="bg-gradient-to-r from-violet-glow via-indigo-300 to-teal-glow bg-clip-text text-transparent">
                    {stats.dueToday} {stats.dueToday === 1 ? "card" : "cards"}
                  </span>{" "}
                  due for review
                </>
              ) : (
                "All caught up — nothing due"
              )}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              {stats.streak > 0
                ? `You're on a ${stats.streak}-day streak 🔥 — keep it alive.`
                : "Review a few cards today to start a streak."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/review" className="!px-6 !py-3">Review due cards</LinkButton>
            <LinkButton href="/quiz/vocab" variant="ghost" className="!px-6 !py-3">Vocabulary quiz</LinkButton>
          </div>
        </div>
      </GlassCard>

      {showStarterChecklist && (
        <GlassCard className="p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Getting started</h2>
          <p className="mt-1 text-sm text-ink-muted">A short path through the core study loop.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {starterSteps.map((step) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]"
                >
                  <span aria-hidden className={step.done ? "text-teal-glow" : "text-ink-muted"}>
                    {step.done ? "✓" : "○"}
                  </span>
                  <span className={step.done ? "text-ink-muted line-through" : "text-ink"}>{step.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {/* Smart daily study plan */}
      <section aria-label="Today's study plan">
        <DailyPlan items={plan} />
      </section>

      {/* Stat tiles */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6" aria-label="Study statistics">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href}>
            <GlassCard hover className="h-full p-4">
              <p className="text-3xl font-semibold tabular-nums">{tile.value}</p>
              <p className="mt-1 text-xs text-ink-muted">{tile.label}</p>
            </GlassCard>
          </Link>
        ))}
      </section>

      {/* Active practice */}
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Active practice">
        {practiceCards.map((p) => (
          <GlassCard key={p.title} hover className="flex h-full flex-col p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
              <span aria-hidden className="mr-1.5">{p.icon}</span>
              {p.title}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">{p.description}</p>
            {p.hint && (
              <p className={`mt-1 text-xs ${p.done ? "text-teal-200" : "text-violet-200"}`}>{p.hint}</p>
            )}
            <div className="mt-auto pt-4">
              <LinkButton href={p.href} variant="ghost" className="!px-4 !py-2 !text-xs">
                {p.cta}
              </LinkButton>
            </div>
          </GlassCard>
        ))}
      </section>

      {/* Streak + quick actions */}
      <section className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Streak</h2>
          <p className="mt-3 font-display text-6xl font-semibold">
            {stats.streak}
            <span className="ml-2 text-lg font-normal text-ink-muted">{stats.streak === 1 ? "day" : "days"}</span>
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Consecutive days with at least one review. Cards are scheduled so everything comes back within a week.
          </p>
        </GlassCard>

        <GlassCard className="p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Quick actions</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <LinkButton href="/cards/new" variant="ghost">+ Add word</LinkButton>
            <LinkButton href="/cards/new?kind=phrase" variant="ghost">+ Add phrase</LinkButton>
            <LinkButton href="/grammar/new" variant="ghost">+ Grammar topic</LinkButton>
            <LinkButton href="/quiz/vocab">Start vocab quiz</LinkButton>
            <LinkButton href="/quiz/grammar">Start grammar quiz</LinkButton>
            <LinkButton href="/stats" variant="ghost">View progress</LinkButton>
          </div>
        </GlassCard>
      </section>
    </main>
  );
}
