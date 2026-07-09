import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import GrammarForm from "@/components/grammar/GrammarForm";
import QuestionPoolPanel from "@/components/grammar/QuestionPoolPanel";
import ProviderStatusPanel from "@/components/grammar/ProviderStatusPanel";
import { toGrammarDTO } from "@/components/grammar/grammar-dto";
import { getQuestionPoolStats } from "@/lib/grammar-question-pool";
import {
  getConfiguredExternalProviders,
  getConfiguredProviders,
  getProviderOrder,
  isAiQuizEnabled,
} from "@/lib/ai/quiz-generator";

export const metadata = { title: "Edit grammar topic — LexiGlass" };

export default async function EditGrammarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const { id } = await params;

  const topic = await db.grammarTopic.findUnique({ where: { id } });
  if (!topic || topic.userId !== userId) notFound();

  const poolStats = await getQuestionPoolStats(userId, id);
  const externalProviders = getConfiguredExternalProviders().map((p) => p.name);
  const providerOrder = getProviderOrder();
  const configuredProviders = getConfiguredProviders().map((p) => p.name);

  return (
    <main className="rise-in mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-3xl font-semibold">Edit “{topic.title}”</h1>
      <GrammarForm topic={toGrammarDTO(topic)} />
      <QuestionPoolPanel
        topicId={id}
        initialStats={{ ...poolStats, lastGeneratedAt: poolStats.lastGeneratedAt?.toISOString() ?? null }}
        aiEnabled={isAiQuizEnabled()}
        externalProviders={externalProviders}
      />
      <ProviderStatusPanel
        status={{
          aiEnabled: isAiQuizEnabled(),
          providerOrder,
          configuredProviders,
          unconfiguredProviders: providerOrder.filter(
            (n) => n !== "local" && !configuredProviders.includes(n)
          ),
          lastGenerationProvider: poolStats.lastGenerationProvider,
          lastGenerationStatus: poolStats.lastGenerationStatus,
          lastGeneratedAt: poolStats.lastGeneratedAt?.toISOString() ?? null,
        }}
      />
    </main>
  );
}
