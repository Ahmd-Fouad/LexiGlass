import QuizRunner from "@/components/quiz/QuizRunner";

export const metadata = { title: "Grammar quiz — LexiGlass" };

export default function GrammarQuizPage() {
  return (
    <main className="rise-in">
      <QuizRunner
        type="grammar"
        title="Grammar quiz"
        description="Questions built from your saved grammar topics — their examples and common mistakes — plus a built-in question bank that leans toward the topics you've studied."
      />
    </main>
  );
}
