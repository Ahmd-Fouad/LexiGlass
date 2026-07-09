"use client";

import { useMemo, useState } from "react";
import { api, formatDate } from "@/lib/client";
import { Button, Chip, GlassCard, LinkButton } from "@/components/ui";
import type { GrammarMistakeRecord } from "@/lib/grammar-mistakes";

export type GrammarMistakeRecordDTO = Omit<
  GrammarMistakeRecord,
  "lastMistakeAt" | "practicedAt" | "resolvedAt"
> & {
  lastMistakeAt: string;
  practicedAt: string | null;
  resolvedAt: string | null;
};

type StatusFilter = "active" | "practiced" | "resolved" | "all";

const STATUS_TONE: Record<string, "rose" | "teal" | "neutral"> = {
  active: "rose",
  practiced: "teal",
  resolved: "neutral",
};

export default function GrammarMistakeRecords({ records }: { records: GrammarMistakeRecordDTO[] }) {
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [state, setState] = useState(records);

  const counts = useMemo(
    () => ({
      all: state.length,
      active: state.filter((r) => r.status === "active").length,
      practiced: state.filter((r) => r.status === "practiced").length,
      resolved: state.filter((r) => r.status === "resolved").length,
    }),
    [state]
  );

  const visible = filter === "all" ? state : state.filter((r) => r.status === filter);

  function updateRecord(id: string, patch: Partial<GrammarMistakeRecordDTO>) {
    setState((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  if (state.length === 0) return null;

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">AI question mistakes</h2>
        <span className="text-xs text-ink-muted">Per-question mistakes from generated grammar quizzes</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {(["active", "practiced", "resolved", "all"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
              filter === f
                ? "border-violet-glow/60 bg-violet-glow/20 text-violet-100"
                : "border-white/15 bg-white/5 text-ink-muted hover:bg-white/10"
            }`}
          >
            {f} <span className="opacity-60">{counts[f]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Nothing in this filter.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((r) => (
            <li key={r.id}>
              <MistakeRecordCard record={r} onChange={(patch) => updateRecord(r.id, patch)} />
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

function MistakeRecordCard({
  record,
  onChange,
}: {
  record: GrammarMistakeRecordDTO;
  onChange: (patch: Partial<GrammarMistakeRecordDTO>) => void;
}) {
  const [practicing, setPracticing] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null);
  const [confirmingResolve, setConfirmingResolve] = useState(false);

  async function submitPractice(chosen?: string) {
    const value = (chosen ?? answer).trim();
    if (!value) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api<{ status: string; mistakeCount: number; correct: boolean }>(
        `/api/grammar-mistakes/${record.id}/practice`,
        { method: "POST", body: { answer: value } }
      );
      onChange({ status: res.status, mistakeCount: res.mistakeCount });
      setFeedback({
        correct: res.correct,
        message: res.correct
          ? "Correct! Marked as practiced."
          : `Not quite. Correct answer: "${record.correctAnswer}"`,
      });
      if (res.correct) {
        setPracticing(false);
        setAnswer("");
      }
    } catch (e) {
      setFeedback({ correct: false, message: e instanceof Error ? e.message : "Could not submit answer." });
    } finally {
      setBusy(false);
    }
  }

  async function markResolved() {
    setBusy(true);
    try {
      const res = await api<{ status: string }>(`/api/grammar-mistakes/${record.id}/resolve`, {
        method: "POST",
      });
      onChange({ status: res.status });
      setConfirmingResolve(false);
    } catch (e) {
      setFeedback({ correct: false, message: e instanceof Error ? e.message : "Could not mark resolved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">{record.question}</p>
          {record.grammarTopicTitle && (
            <p className="mt-0.5 text-xs text-ink-muted">Topic: {record.grammarTopicTitle}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Chip tone={STATUS_TONE[record.status] ?? "neutral"}>{record.status}</Chip>
          {record.questionType && <Chip tone="violet">{record.questionType}</Chip>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <Chip tone="rose">
          {record.mistakeCount} {record.mistakeCount === 1 ? "miss" : "misses"}
        </Chip>
        <span>last missed {formatDate(record.lastMistakeAt)}</span>
      </div>

      <div className="mt-3 rounded-lg bg-black/20 px-3 py-2 text-sm">
        <p>
          Your answer: <span className="text-rose-200">{record.userAnswer}</span>
          {" · "}Correct: <span className="text-teal-200">{record.correctAnswer}</span>
        </p>
        {record.explanation && <p className="mt-1 text-xs text-ink-muted">{record.explanation}</p>}
      </div>

      {feedback && (
        <p className={`mt-3 text-sm ${feedback.correct ? "text-teal-200" : "text-rose-200"}`}>
          {feedback.message}
        </p>
      )}

      {practicing && record.status !== "resolved" && (
        <div className="mt-3 space-y-2">
          {record.choices && record.choices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {record.choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  disabled={busy}
                  onClick={() => submitPractice(choice)}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
                >
                  {choice}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                className="field !w-auto flex-1"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer…"
                disabled={busy}
              />
              <Button onClick={() => submitPractice()} disabled={busy || !answer.trim()} className="!px-4">
                Submit
              </Button>
            </div>
          )}
        </div>
      )}

      {record.status !== "resolved" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!practicing && (
            <Button
              variant="ghost"
              className="!px-3.5 !py-1.5 !text-xs"
              onClick={() => {
                setPracticing(true);
                setFeedback(null);
              }}
            >
              Practice this mistake
            </Button>
          )}
          {confirmingResolve ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-ink-muted">Mark resolved?</span>
              <Button variant="danger" className="!px-3 !py-1 !text-xs" onClick={markResolved} disabled={busy}>
                Confirm
              </Button>
              <Button
                variant="ghost"
                className="!px-3 !py-1 !text-xs"
                onClick={() => setConfirmingResolve(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="!px-3.5 !py-1.5 !text-xs"
              onClick={() => setConfirmingResolve(true)}
            >
              Mark resolved
            </Button>
          )}
          {record.grammarTopicId && (
            <LinkButton
              href={`/grammar/${record.grammarTopicId}/edit`}
              variant="ghost"
              className="!px-3.5 !py-1.5 !text-xs"
            >
              Open grammar topic
            </LinkButton>
          )}
        </div>
      )}
    </div>
  );
}
