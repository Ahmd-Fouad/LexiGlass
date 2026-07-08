import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { LinkButton } from "@/components/ui";
import GrammarBrowser from "@/components/grammar/GrammarBrowser";
import { toGrammarDTO } from "@/components/grammar/grammar-dto";

export const metadata = { title: "Grammar — LexiGlass" };

export default async function GrammarPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const topics = await db.grammarTopic.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="rise-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Grammar</h1>
          <p className="mt-1 text-sm text-ink-muted">The rules you've studied, with examples and common mistakes.</p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/quiz/grammar" variant="ghost">Grammar quiz</LinkButton>
          <LinkButton href="/grammar/new">+ Add topic</LinkButton>
        </div>
      </div>
      <GrammarBrowser topics={topics.map(toGrammarDTO)} />
    </main>
  );
}
