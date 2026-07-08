import GrammarForm from "@/components/grammar/GrammarForm";

export const metadata = { title: "Add grammar topic — LexiGlass" };

export default function NewGrammarPage() {
  return (
    <main className="rise-in mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold">Add a grammar topic</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The examples and common mistakes you write here feed the grammar quiz.
        </p>
      </div>
      <GrammarForm />
    </main>
  );
}
