import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { EmptyState, LinkButton } from "@/components/ui";
import ReviewSession from "@/components/review/ReviewSession";
import { toCardDTO } from "@/components/cards/card-dto";
import { REVIEW_MODE_LABELS, selectReviewCards, type ReviewMode } from "@/lib/review";
import { MISTAKE_WINDOW_DAYS } from "@/lib/analytics";
import { getRecentMistakeCounts } from "@/lib/learning-data";

export const metadata = { title: "Review — LexiGlass" };

const MODE_DESCRIPTIONS: Record<ReviewMode, string> = {
  due: "Cards scheduled for today. Flip each card, then rate how well you remembered it.",
  weak: "Cards you keep forgetting — repeated lapses or low accuracy. Extra practice fixes them fastest.",
  mistakes: `Words answered wrong in a quiz or rated "Again" in the last ${MISTAKE_WINDOW_DAYS} days.`,
  mixed: "A daily blend: due cards first, then recent mistakes and weak words.",
};

const EMPTY_STATES: Record<ReviewMode, { title: string; hint: string }> = {
  due: {
    title: "Nothing due right now",
    hint: "Every card is scheduled for later. You can review ahead of schedule, take a quiz, or add new words.",
  },
  weak: {
    title: "No weak words 💪",
    hint: "No cards with repeated lapses or low accuracy. Keep reviewing and this list stays empty.",
  },
  mistakes: {
    title: "No recent mistakes",
    hint: `Nothing answered wrong in the last ${MISTAKE_WINDOW_DAYS} days. Take a quiz to test yourself.`,
  },
  mixed: {
    title: "Nothing to study yet",
    hint: "Add a few words first — the mixed session combines due cards, weak words and recent mistakes.",
  },
};

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ ahead?: string; mode?: string; tag?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const params = await searchParams;
  const reviewAhead = params.ahead === "1";
  const mode: ReviewMode = (["due", "weak", "mistakes", "mixed"] as const).includes(
    params.mode as ReviewMode
  )
    ? (params.mode as ReviewMode)
    : "due";
  const tag = params.tag?.trim() || null;

  const allCards = await db.flashcard.findMany({ where: { userId } });
  // "Again"/wrong-answer history only matters outside the plain due queue.
  const recentMistakes =
    mode === "due" && !reviewAhead ? new Map<string, number>() : await getRecentMistakeCounts(userId);

  const cards = reviewAhead
    ? selectReviewCards(allCards, { mode: "mixed", size: 20, recentMistakes, tag })
    : selectReviewCards(allCards, { mode, size: mode === "due" ? 30 : 20, recentMistakes, tag });

  const sessionKey = `${mode}-${tag ?? ""}-${reviewAhead ? "ahead" : ""}`;

  return (
    <main className="rise-in space-y-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold">Review</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-ink-muted">{MODE_DESCRIPTIONS[mode]}</p>
      </div>

      {/* Mode switcher */}
      <nav aria-label="Review mode" className="flex flex-wrap justify-center gap-2">
        {(Object.keys(REVIEW_MODE_LABELS) as ReviewMode[]).map((m) => (
          <Link
            key={m}
            href={m === "due" ? "/review" : `/review?mode=${m}`}
            aria-current={m === mode ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              m === mode
                ? "border-violet-glow/60 bg-violet-glow/20 text-violet-100"
                : "border-white/15 bg-white/5 text-ink-muted hover:bg-white/10"
            }`}
          >
            {REVIEW_MODE_LABELS[m]}
          </Link>
        ))}
      </nav>

      {tag && (
        <p className="text-center text-sm text-ink-muted">
          Filtering by tag: <span className="text-violet-200">{tag}</span> ·{" "}
          <Link className="underline" href={mode === "due" ? "/review" : `/review?mode=${mode}`}>
            clear
          </Link>
        </p>
      )}

      {cards.length === 0 ? (
        <EmptyState
          title={EMPTY_STATES[mode].title}
          hint={EMPTY_STATES[mode].hint}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              {mode === "due" && !reviewAhead && (
                <LinkButton href="/review?ahead=1" variant="ghost">Review ahead</LinkButton>
              )}
              <LinkButton href="/quiz/vocab">Vocabulary quiz</LinkButton>
              <LinkButton href="/cards/new" variant="ghost">+ Add word</LinkButton>
            </div>
          }
        />
      ) : (
        <ReviewSession
          key={sessionKey}
          cards={cards.map(toCardDTO)}
          ahead={reviewAhead}
          modeLabel={reviewAhead ? "Ahead of schedule" : REVIEW_MODE_LABELS[mode]}
        />
      )}
    </main>
  );
}
