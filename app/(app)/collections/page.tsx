import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { getRecentMistakeCounts } from "@/lib/learning-data";
import { getCollectionActions, getStudyCollections } from "@/lib/collections";
import { formatDate } from "@/lib/client";
import { Chip, EmptyState, GlassCard, LinkButton } from "@/components/ui";

export const metadata = { title: "Study collections — LexiGlass" };

export default async function CollectionsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const [cards, grammarTopicCount, recentMistakes] = await Promise.all([
    db.flashcard.findMany({ where: { userId } }),
    db.grammarTopic.count({ where: { userId } }),
    getRecentMistakeCounts(userId),
  ]);

  const collections = getStudyCollections(cards, { recentMistakes, grammarTopicCount });

  return (
    <main className="rise-in space-y-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold">Study collections</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-ink-muted">
          Ready-made study sets from your own cards — study by status, tag, category or difficulty.
          Each set can be reviewed, quizzed or used for writing practice.
        </p>
      </div>

      {collections.length === 0 ? (
        <EmptyState
          title="No collections yet"
          hint="Add tags or categories to your cards, and review a few, so collections like Due today, Weak words and your tags appear here."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <LinkButton href="/cards/new">+ Add words</LinkButton>
              <LinkButton href="/cards" variant="ghost">Browse cards</LinkButton>
            </div>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {collections.map((col) => (
            <li key={col.id}>
              <GlassCard hover className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-xl font-semibold">{col.title}</h2>
                  <Chip tone="violet">
                    {col.count} {col.kind === "grammar" ? (col.count === 1 ? "topic" : "topics") : col.count === 1 ? "card" : "cards"}
                  </Chip>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{col.description}</p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  {col.dueCount > 0 && <Chip tone="rose">{col.dueCount} due</Chip>}
                  {col.weakCount > 0 && <Chip tone="amber">{col.weakCount} weak</Chip>}
                  {col.lastStudied && (
                    <span className="text-ink-muted">last studied {formatDate(col.lastStudied)}</span>
                  )}
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {getCollectionActions(col).map((a) => (
                    <LinkButton
                      key={a.label}
                      href={a.href}
                      variant={a.variant}
                      className="!px-3 !py-1.5 !text-xs"
                    >
                      {a.label}
                    </LinkButton>
                  ))}
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
