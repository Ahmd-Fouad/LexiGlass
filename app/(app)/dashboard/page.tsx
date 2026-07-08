import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDashboardStats } from "@/lib/stats";
import { GlassCard, LinkButton } from "@/components/ui";

export const metadata = { title: "Dashboard — LexiGlass" };

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const stats = await getDashboardStats(user.id);

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
