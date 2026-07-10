import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { getRecentMistakeCounts } from "@/lib/learning-data";
import PronunciationPractice from "@/components/pronunciation/PronunciationPractice";
import {
  PRONUNCIATION_MODES,
  selectPronunciationTargets,
  type PronunciationMode,
} from "@/lib/pronunciation";

export const metadata = { title: "Pronunciation practice — LexiGlass" };

export default async function PronunciationPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const params = await searchParams;

  const mode: PronunciationMode = PRONUNCIATION_MODES.includes(params.mode as PronunciationMode)
    ? (params.mode as PronunciationMode)
    : "weak";

  const cards = await db.flashcard.findMany({ where: { userId } });
  const recentMistakes =
    mode === "mistakes" ? await getRecentMistakeCounts(userId) : new Map<string, number>();
  const initialTargets = selectPronunciationTargets(cards, mode, { recentMistakes });

  return (
    <main className="rise-in">
      <PronunciationPractice initialMode={mode} initialTargets={initialTargets} />
    </main>
  );
}
