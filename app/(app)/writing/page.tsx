import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import WritingPractice, { type WritingAttemptDTO } from "@/components/writing/WritingPractice";
import { WRITING_MODES, type WritingMode } from "@/lib/writing-practice";

export const metadata = { title: "Writing practice — LexiGlass" };

export default async function WritingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; tag?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const params = await searchParams;

  const [cards, attempts] = await Promise.all([
    db.flashcard.findMany({ where: { userId }, select: { tags: true } }),
    db.writingAttempt.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const tags = [
    ...new Set(cards.flatMap((c) => c.tags.split(",").map((t) => t.trim()).filter(Boolean))),
  ].sort((a, b) => a.localeCompare(b));

  const initialMode: WritingMode = WRITING_MODES.includes(params.mode as WritingMode)
    ? (params.mode as WritingMode)
    : "weak";
  const initialTag = params.tag && tags.includes(params.tag) ? params.tag : "";

  const recentAttempts: WritingAttemptDTO[] = attempts.map((a) => ({
    id: a.id,
    mode: a.mode,
    score: a.score,
    promptWords: a.promptWords as unknown as WritingAttemptDTO["promptWords"],
    feedback: a.feedback as unknown as WritingAttemptDTO["feedback"],
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <main className="rise-in">
      <WritingPractice
        availableTags={tags}
        initialMode={initialMode}
        initialTag={initialTag}
        recentAttempts={recentAttempts}
      />
    </main>
  );
}
