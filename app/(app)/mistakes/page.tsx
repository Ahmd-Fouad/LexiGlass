import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { getMistakeBank } from "@/lib/learning-data";
import { EmptyState, LinkButton } from "@/components/ui";
import MistakeBank, {
  type GrammarMistakeDTO,
  type VocabMistakeDTO,
} from "@/components/mistakes/MistakeBank";
import GrammarMistakeRecords, {
  type GrammarMistakeRecordDTO,
} from "@/components/mistakes/GrammarMistakeRecords";

export const metadata = { title: "Mistake Bank — LexiGlass" };

export default async function MistakesPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const { vocab, grammar, grammarRecords } = await getMistakeBank(userId);

  const vocabDTO: VocabMistakeDTO[] = vocab.map((m) => ({
    ...m,
    lastMistakeAt: m.lastMistakeAt?.toISOString() ?? null,
  }));
  const grammarDTO: GrammarMistakeDTO[] = grammar.map((m) => ({
    ...m,
    lastMistakeAt: m.lastMistakeAt?.toISOString() ?? null,
  }));
  const grammarRecordsDTO: GrammarMistakeRecordDTO[] = grammarRecords.map((r) => ({
    ...r,
    lastMistakeAt: r.lastMistakeAt.toISOString(),
    practicedAt: r.practicedAt?.toISOString() ?? null,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  }));

  return (
    <main className="rise-in space-y-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold">Mistake Bank</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-ink-muted">
          Every word, phrase and grammar topic you keep getting wrong — in one place, worst first.
        </p>
      </div>

      {vocabDTO.length === 0 && grammarDTO.length === 0 && grammarRecordsDTO.length === 0 ? (
        <EmptyState
          title="No mistakes yet"
          hint="Complete a quiz or review session to generate mistake insights. Anything you miss lands here so you can fix it fast."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <LinkButton href="/quiz/vocab">Take a vocabulary quiz</LinkButton>
              <LinkButton href="/review" variant="ghost">Review cards</LinkButton>
            </div>
          }
        />
      ) : (
        <>
          <GrammarMistakeRecords records={grammarRecordsDTO} />
          <MistakeBank vocab={vocabDTO} grammar={grammarDTO} />
        </>
      )}
    </main>
  );
}
