import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { EmptyState, LinkButton } from "@/components/ui";
import ReviewSession from "@/components/review/ReviewSession";
import { toCardDTO } from "@/components/cards/card-dto";

export const metadata = { title: "Review — LexiGlass" };

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ ahead?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const { ahead } = await searchParams;
  const reviewAhead = ahead === "1";

  const cards = reviewAhead
    ? await db.flashcard.findMany({ where: { userId }, orderBy: { dueDate: "asc" }, take: 20 })
    : await db.flashcard.findMany({
        where: { userId, dueDate: { lte: new Date() } },
        orderBy: { dueDate: "asc" },
        take: 30,
      });

  return (
    <main className="rise-in space-y-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold">Review</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Flip each card, then rate how well you remembered it. Ratings set when it comes back.
        </p>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title="Nothing due right now"
          hint="Every card is scheduled for later. You can review ahead of schedule, take a quiz, or add new words."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <LinkButton href="/review?ahead=1" variant="ghost">Review ahead</LinkButton>
              <LinkButton href="/quiz/vocab">Vocabulary quiz</LinkButton>
              <LinkButton href="/cards/new" variant="ghost">+ Add word</LinkButton>
            </div>
          }
        />
      ) : (
        <ReviewSession key={reviewAhead ? "ahead" : "due"} cards={cards.map(toCardDTO)} ahead={reviewAhead} />
      )}
    </main>
  );
}
