import CardForm from "@/components/cards/CardForm";

export const metadata = { title: "Add card — LexiGlass" };

export default async function NewCardPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  return (
    <main className="rise-in mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold">Add a {kind === "phrase" ? "phrase" : "word"}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          New cards are due immediately, so they'll show up in your next review or quiz.
        </p>
      </div>
      <CardForm initialKind={kind} />
    </main>
  );
}
