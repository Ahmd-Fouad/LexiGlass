import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { LinkButton } from "@/components/ui";
import CardsBrowser from "@/components/cards/CardsBrowser";
import { toCardDTO } from "@/components/cards/card-dto";

export const metadata = { title: "Flashcards — LexiGlass" };

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    tag?: string;
    difficulty?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const { kind, tag, difficulty, status, q } = await searchParams;

  const cards = await db.flashcard.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="rise-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Flashcards</h1>
          <p className="mt-1 text-sm text-ink-muted">Your words and phrases, with their review schedule.</p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/review" variant="ghost">Review due</LinkButton>
          <LinkButton href="/cards/new">+ Add card</LinkButton>
        </div>
      </div>
      <CardsBrowser
        cards={cards.map(toCardDTO)}
        initialKind={kind}
        initialTag={tag}
        initialDifficulty={difficulty}
        initialStatus={status}
        initialSearch={q}
      />
    </main>
  );
}
