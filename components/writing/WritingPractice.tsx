"use client";

import { useMemo, useState } from "react";
import { api, formatDate } from "@/lib/client";
import { Button, Chip, EmptyState, ErrorBanner, GlassCard, LinkButton, Select, Spinner, TextArea } from "@/components/ui";
import SpeakButton from "@/components/pronunciation/SpeakButton";
import {
  analyzeWritingAttempt,
  type WritingFeedback,
  type WritingMode,
  type WritingTarget,
} from "@/lib/writing-practice";

// JSON-safe shape of a saved attempt (dates as ISO strings).
export interface WritingAttemptDTO {
  id: string;
  mode: string;
  score: number;
  promptWords: Pick<WritingTarget, "text" | "kind">[];
  feedback: Pick<WritingFeedback, "wordCount" | "usedTargets">;
  createdAt: string;
}

const MODES: { mode: WritingMode; label: string; hint: string }[] = [
  { mode: "weak", label: "Weak words", hint: "Words you keep getting wrong" },
  { mode: "due", label: "Due words", hint: "Cards due for review" },
  { mode: "mistakes", label: "Recent mistakes", hint: "Missed in the last 2 weeks" },
  { mode: "phrases", label: "Difficult phrases", hint: "Practise multi-word phrases" },
  { mode: "random", label: "Random words", hint: "A mixed set from your cards" },
  { mode: "tag", label: "By tag", hint: "Words carrying a tag" },
];

interface TargetsResponse {
  mode: WritingMode;
  targets: WritingTarget[];
}

function scoreTone(score: number): "teal" | "amber" | "rose" {
  return score >= 75 ? "teal" : score >= 50 ? "amber" : "rose";
}

export default function WritingPractice({
  availableTags = [],
  initialMode = "weak",
  initialTag = "",
  recentAttempts = [],
}: {
  availableTags?: string[];
  initialMode?: WritingMode;
  initialTag?: string;
  recentAttempts?: WritingAttemptDTO[];
}) {
  const [phase, setPhase] = useState<"setup" | "loading" | "write">("setup");
  const [mode, setMode] = useState<WritingMode>(initialMode);
  const [tag, setTag] = useState(initialTag);
  const [targets, setTargets] = useState<WritingTarget[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<WritingAttemptDTO[]>(recentAttempts);

  const feedback = useMemo(
    () => (targets.length > 0 && text.trim() ? analyzeWritingAttempt(text, targets) : null),
    [text, targets]
  );

  async function loadTargets(nextMode: WritingMode = mode) {
    setPhase("loading");
    setError(null);
    setText("");
    setSavedId(null);
    try {
      const params = new URLSearchParams({ mode: nextMode });
      if (nextMode === "tag" && tag) params.set("tag", tag);
      const res = await api<TargetsResponse>(`/api/writing/targets?${params.toString()}`);
      setTargets(res.targets);
      setPhase("write");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load target words");
      setPhase("setup");
    }
  }

  async function save() {
    if (!feedback || targets.length === 0 || !text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ attempt: WritingAttemptDTO }>("/api/writing/attempts", {
        method: "POST",
        body: { mode, targetIds: targets.map((t) => t.id), text },
      });
      setSavedId(res.attempt.id);
      setAttempts((prev) => [res.attempt, ...prev].slice(0, 10));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the attempt");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- Setup ---------------- */
  if (phase === "setup" || phase === "loading") {
    return (
      <GlassCard className="mx-auto max-w-xl p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">Writing practice</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Write with your words</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
          Pick a set of target words or phrases and write real sentences with them. Your writing is
          checked locally with grammar and usage rules — no AI, nothing leaves your account.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Writing mode">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={mode === m.mode}
              title={m.hint}
              onClick={() => setMode(m.mode)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                mode === m.mode
                  ? "border-violet-glow/60 bg-violet-glow/20 text-violet-100"
                  : "border-white/15 bg-white/5 text-ink-muted hover:bg-white/10"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-muted">{MODES.find((m) => m.mode === mode)?.hint}</p>

        {mode === "tag" && (
          <div className="mx-auto mt-3 max-w-56">
            {availableTags.length > 0 ? (
              <Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Choose a tag">
                <option value="">Pick a tag…</option>
                {availableTags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            ) : (
              <p className="text-xs text-ink-muted">Add tags to your cards to use this mode.</p>
            )}
          </div>
        )}

        {error && <div className="mt-4"><ErrorBanner message={error} /></div>}

        {phase === "loading" ? (
          <Spinner label="Choosing your words…" />
        ) : (
          <Button
            onClick={() => loadTargets()}
            disabled={mode === "tag" && !tag}
            className="mt-6 !px-10 !py-3"
          >
            Start writing
          </Button>
        )}

        {attempts.length > 0 && <RecentAttempts attempts={attempts} />}
      </GlassCard>
    );
  }

  /* ---------------- No targets ---------------- */
  if (targets.length === 0) {
    return (
      <EmptyState
        title="No target words found"
        hint="Add more flashcards or complete reviews to generate weak words. Then come back and start writing."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <LinkButton href="/cards/new">+ Add words</LinkButton>
            <Button variant="ghost" onClick={() => setPhase("setup")}>Choose another mode</Button>
          </div>
        }
      />
    );
  }

  /* ---------------- Write ---------------- */
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">Writing practice</h1>
        <Chip tone="violet">{MODES.find((m) => m.mode === mode)?.label ?? mode}</Chip>
      </div>

      {/* Target words */}
      <GlassCard className="p-5">
        <p className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Use these {targets.length} in your writing
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {targets.map((t) => {
            const used = feedback?.targets.find((u) => u.id === t.id);
            return (
              <li
                key={t.id}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                  used?.complete
                    ? "border-teal-glow/40 bg-teal-glow/10"
                    : used?.partial
                      ? "border-amber-400/40 bg-amber-400/10"
                      : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <span aria-hidden className="mt-0.5">
                  {used?.complete ? "✓" : used?.partial ? "◐" : "○"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium italic">{t.text}</span>
                    <SpeakButton text={t.text} className="!size-6 !text-xs" />
                    <Chip tone="neutral">{t.kind}</Chip>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{t.meaning}</span>
                </span>
                <LinkButton
                  href={`/cards/${t.id}/edit`}
                  variant="ghost"
                  className="!px-2 !py-0.5 !text-[11px]"
                >
                  Open
                </LinkButton>
              </li>
            );
          })}
        </ul>
      </GlassCard>

      {/* Writing area */}
      <GlassCard className="p-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-muted">
            Your sentences or short paragraph
          </span>
          <TextArea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSavedId(null);
            }}
            placeholder="Write a few sentences using each target word…"
            className="min-h-40"
            aria-label="Your writing"
          />
        </label>
        {feedback && (
          <p className="mt-2 text-xs text-ink-muted">
            {feedback.wordCount} words · {feedback.sentenceCount}{" "}
            {feedback.sentenceCount === 1 ? "sentence" : "sentences"}
          </p>
        )}
      </GlassCard>

      {error && <ErrorBanner message={error} />}

      {/* Feedback */}
      {feedback && <FeedbackPanel feedback={feedback} />}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={save} disabled={saving || !feedback || !text.trim()}>
          {saving ? "Saving…" : savedId ? "Saved ✓" : "Save attempt"}
        </Button>
        <Button variant="ghost" onClick={() => loadTargets()}>Use another set</Button>
        <Button
          variant="ghost"
          onClick={() => {
            setText("");
            setSavedId(null);
          }}
        >
          Clear
        </Button>
        <Button variant="ghost" onClick={() => setPhase("setup")}>Change mode</Button>
      </div>

      {attempts.length > 0 && (
        <GlassCard className="p-5">
          <RecentAttempts attempts={attempts} />
        </GlassCard>
      )}
    </div>
  );
}

function FeedbackPanel({ feedback }: { feedback: WritingFeedback }) {
  const tone = scoreTone(feedback.score);
  return (
    <GlassCard className="space-y-4 p-5">
      {/* Score */}
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold uppercase tracking-wider text-ink-muted">Score</span>
          <span
            className={
              tone === "teal" ? "text-teal-200" : tone === "amber" ? "text-amber-200" : "text-rose-200"
            }
          >
            {feedback.score}/100
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${
              tone === "teal"
                ? "bg-teal-glow"
                : tone === "amber"
                  ? "bg-amber-400"
                  : "bg-rose-glow"
            }`}
            style={{ width: `${feedback.score}%` }}
          />
        </div>
      </div>

      {/* Target usage summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Used</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {feedback.usedTargets.length > 0 ? (
              feedback.usedTargets.map((t) => <Chip key={t} tone="teal">{t}</Chip>)
            ) : (
              <span className="text-xs text-ink-muted">None yet</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Missing</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {feedback.missingTargets.length > 0 ? (
              feedback.missingTargets.map((t) => <Chip key={t} tone="rose">{t}</Chip>)
            ) : (
              <span className="text-xs text-ink-muted">All used 🎉</span>
            )}
          </div>
        </div>
      </div>

      {feedback.incompleteTargets.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Incomplete phrases
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {feedback.incompleteTargets.map((t) => <Chip key={t} tone="amber">{t}</Chip>)}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {feedback.warnings.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Suggestions</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-muted">
            {feedback.warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-amber-300">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strengths */}
      {feedback.strengths.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">What went well</p>
          <ul className="mt-1.5 space-y-1 text-sm text-teal-200">
            {feedback.strengths.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden>✓</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}

function RecentAttempts({ attempts }: { attempts: WritingAttemptDTO[] }) {
  return (
    <div className="text-left">
      <p className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Recent attempts</p>
      <ul className="mt-3 space-y-2">
        {attempts.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              <span className="font-medium capitalize">{a.mode}</span>
              <span className="text-ink-muted">
                {" "}· {a.promptWords.length} words · {a.feedback.wordCount} written
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Chip tone={scoreTone(a.score)}>{a.score}</Chip>
              <span className="text-xs text-ink-muted">{formatDate(a.createdAt)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
