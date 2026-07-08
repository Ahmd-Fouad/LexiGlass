import QuizRunner from "@/components/quiz/QuizRunner";

export const metadata = { title: "Vocabulary quiz — LexiGlass" };

export default function VocabQuizPage() {
  return (
    <main className="rise-in">
      <QuizRunner
        type="vocab"
        title="Vocabulary quiz"
        description="Around 20 words and phrases, picked by your review schedule: cards due today first, then words you've struggled with and older cards. Answers update each card's schedule automatically."
      />
    </main>
  );
}
