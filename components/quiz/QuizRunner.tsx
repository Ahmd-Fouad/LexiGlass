"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { answersMatch } from "@/lib/quiz";
import { Button, Chip, ErrorBanner, GlassCard, Input, LinkButton, Spinner } from "@/components/ui";
import type { QuizQuestion, StartQuizResponse } from "@/lib/types";

type Phase = "intro" | "loading" | "question" | "feedback" | "results";

interface AnsweredQuestion {
  question: QuizQuestion;
  userAnswer: string;
  isCorrect: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  mcq_meaning: "Meaning",
  mcq_word: "Find the word",
  fill_blank: "Fill in the blank",
  true_false: "True or false",
  mcq: "Multiple choice",
  choose_correct: "Choose the correct sentence",
  find_mistake: "Find the mistake",
  correct_sentence: "Correct the sentence",
};

export default function QuizRunner({
  type,
  title,
  description,
}: {
  type: "vocab" | "grammar";
  title: string;
  description: string;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [answered, setAnswered] = useState<AnsweredQuestion[]>([]);
  const [lastAnswer, setLastAnswer] = useState<AnsweredQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetry, setIsRetry] = useState(false);

  const question = questions[index];

  async function start() {
    setPhase("loading");
    setError(null);
    try {
      const res = await api<StartQuizResponse>("/api/quiz/start", { method: "POST", body: { type } });
      setSessionId(res.sessionId);
      setQuestions(res.questions);
      setAnswered([]);
      setIndex(0);
      setTyped("");
      setIsRetry(false);
      setPhase("question");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the quiz");
      setPhase("intro");
    }
  }

  async function submitAnswer(userAnswer: string) {
    if (!question) return;
    const isCorrect =
      question.options != null
        ? userAnswer === question.answer
        : answersMatch(question.answer, userAnswer);

    const record: AnsweredQuestion = { question, userAnswer, isCorrect };
    setLastAnswer(record);
    setAnswered((a) => [...a, record]);
    setPhase("feedback");

    // Retry passes are practice only — they don't change the saved results or schedule.
    if (!isRetry && sessionId) {
      api("/api/quiz/answer", {
        method: "POST",
        body: {
          sessionId,
          flashcardId: question.flashcardId,
          grammarTopicId: question.grammarTopicId,
          questionType: question.type,
          question: question.prompt + (question.context ? ` — ${question.context}` : ""),
          correctAnswer: question.answer,
          userAnswer,
          isCorrect,
        },
      }).catch(() => {
        // Answer recording failures shouldn't interrupt the quiz.
      });
    }
  }

  async function next() {
    setTyped("");
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setPhase("question");
    } else {
      setPhase("results");
      if (!isRetry && sessionId) {
        api("/api/quiz/finish", { method: "POST", body: { sessionId } }).catch(() => {});
      }
    }
  }

  function retryWrong() {
    const wrong = answered.filter((a) => !a.isCorrect).map((a) => a.question);
    setQuestions(wrong);
    setAnswered([]);
    setIndex(0);
    setTyped("");
    setIsRetry(true);
    setPhase("question");
  }

  /* ---------------- Intro ---------------- */
  if (phase === "intro" || phase === "loading") {
    return (
      <GlassCard className="mx-auto max-w-xl p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">{type === "vocab" ? "Vocabulary" : "Grammar"}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">{description}</p>
        {error && <div className="mt-4"><ErrorBanner message={error} /></div>}
        {phase === "loading" ? (
          <Spinner label="Building your quiz…" />
        ) : (
          <Button onClick={start} className="mt-8 !px-10 !py-3">Start quiz</Button>
        )}
      </GlassCard>
    );
  }

  /* ---------------- Results ---------------- */
  if (phase === "results") {
    const correct = answered.filter((a) => a.isCorrect).length;
    const total = answered.length;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const wrongCount = total - correct;
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <GlassCard className="p-8 text-center">
          {isRetry && <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">Practice retry</p>}
          <p className="font-display text-6xl font-semibold">
            <span className={pct >= 70 ? "text-teal-glow" : pct >= 40 ? "text-amber-300" : "text-rose-glow"}>{pct}%</span>
          </p>
          <p className="mt-2 text-ink-muted">{correct} of {total} correct</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {wrongCount > 0 && (
              <Button onClick={retryWrong} variant="ghost">Retry {wrongCount} wrong {wrongCount === 1 ? "answer" : "answers"}</Button>
            )}
            <Button onClick={start}>New quiz</Button>
            <LinkButton href="/dashboard" variant="ghost">Dashboard</LinkButton>
          </div>
        </GlassCard>

        <ul className="space-y-2">
          {answered.map((a, i) => (
            <li key={i}>
              <GlassCard className={`p-4 text-sm ${a.isCorrect ? "" : "!border-rose-glow/30"}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{a.question.prompt}</p>
                  <Chip tone={a.isCorrect ? "teal" : "rose"}>{a.isCorrect ? "Correct" : "Wrong"}</Chip>
                </div>
                {a.question.context && <p className="mt-1 text-ink-muted italic">{a.question.context}</p>}
                <p className="mt-2 text-ink-muted">
                  Your answer: <span className={a.isCorrect ? "text-teal-200" : "text-rose-200"}>{a.userAnswer}</span>
                  {!a.isCorrect && (
                    <> · Correct: <span className="text-teal-200">{a.question.answer}</span></>
                  )}
                </p>
              </GlassCard>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /* ---------------- Question / feedback ---------------- */
  const isTyped = question.options == null;
  const showingFeedback = phase === "feedback" && lastAnswer;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>Question {index + 1} of {questions.length}{isRetry && " · practice retry"}</span>
        <Chip tone="violet">{TYPE_LABELS[question.type] ?? "Question"}</Chip>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-glow to-teal-glow transition-all duration-300"
          style={{ width: `${(index / questions.length) * 100}%` }}
        />
      </div>

      <GlassCard className="p-6 sm:p-8">
        <p className="text-lg font-medium sm:text-xl">{question.prompt}</p>
        {question.context && (
          <p className="mt-3 rounded-xl bg-white/5 px-4 py-3 font-display text-lg italic">{question.context}</p>
        )}

        {/* Answer area */}
        {!showingFeedback && (
          <div className="mt-6">
            {isTyped ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typed.trim()) submitAnswer(typed.trim());
                }}
                className="flex flex-col gap-3 sm:flex-row"
              >
                <Input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Type your answer…"
                  aria-label="Your answer"
                />
                <Button type="submit" disabled={!typed.trim()} className="shrink-0 !px-8">Check</Button>
              </form>
            ) : (
              <div className={`grid gap-3 ${question.options!.length === 2 ? "grid-cols-2" : "sm:grid-cols-2"}`}>
                {question.options!.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => submitAnswer(opt)}
                    className="btn-ghost rounded-xl px-4 py-3.5 text-left text-sm font-medium transition-transform hover:scale-[1.01]"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Feedback */}
        {showingFeedback && (
          <div className="mt-6 space-y-4">
            <div
              className={`rounded-xl border px-4 py-3 ${
                lastAnswer.isCorrect
                  ? "border-teal-glow/40 bg-teal-glow/10 text-teal-100"
                  : "border-rose-glow/40 bg-rose-glow/10 text-rose-100"
              }`}
              role="status"
            >
              <p className="font-semibold">{lastAnswer.isCorrect ? "Correct!" : "Not quite."}</p>
              {!lastAnswer.isCorrect && (
                <p className="mt-1 text-sm">
                  You answered “{lastAnswer.userAnswer}”. Correct answer: <strong>{lastAnswer.question.answer}</strong>
                </p>
              )}
              {lastAnswer.question.explanation && (
                <p className="mt-1 text-sm opacity-90">{lastAnswer.question.explanation}</p>
              )}
            </div>
            <Button onClick={next} className="w-full !py-3">
              {index + 1 < questions.length ? "Next question" : "See results"}
            </Button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
