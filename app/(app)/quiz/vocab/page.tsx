import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import QuizRunner from "@/components/quiz/QuizRunner";

export const metadata = { title: "Vocabulary quiz — LexiGlass" };

export default async function VocabQuizPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; tag?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const params = await searchParams;

  // Distinct tags across the user's cards, for the "quiz by tag" option.
  const cards = await db.flashcard.findMany({ where: { userId }, select: { tags: true } });
  const tags = [...new Set(
    cards.flatMap((c) => c.tags.split(",").map((t) => t.trim()).filter(Boolean))
  )].sort((a, b) => a.localeCompare(b));

  const initialMode =
    params.mode === "weak" || params.mode === "mistakes" ? params.mode : "standard";
  const initialTag = params.tag && tags.includes(params.tag) ? params.tag : "";

  return (
    <main className="rise-in">
      <QuizRunner
        type="vocab"
        title="Vocabulary quiz"
        description="Around 20 words and phrases, picked by your review schedule: cards due today first, then words you've struggled with and older cards. Answers update each card's schedule automatically."
        availableTags={tags}
        initialMode={initialMode}
        initialTag={initialTag}
      />
    </main>
  );
}
