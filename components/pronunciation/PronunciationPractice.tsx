"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button, Chip, EmptyState, ErrorBanner, GlassCard, LinkButton, Spinner } from "@/components/ui";
import {
  compareSpokenText,
  type PronunciationMode,
  type PronunciationTarget,
  type SpeechComparison,
} from "@/lib/pronunciation";

/* Minimal typings for the Web Speech API (not in the standard DOM lib). */
interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MODES: { mode: PronunciationMode; label: string; hint: string }[] = [
  { mode: "weak", label: "Weak words", hint: "Words you keep getting wrong" },
  { mode: "due", label: "Due words", hint: "Cards due for review" },
  { mode: "phrases", label: "Phrases", hint: "Multi-word phrases" },
  { mode: "sentences", label: "Example sentences", hint: "Say full sentences" },
  { mode: "mistakes", label: "Recent mistakes", hint: "Missed in the last 2 weeks" },
];

interface TargetsResponse {
  mode: PronunciationMode;
  targets: PronunciationTarget[];
}

function simTone(sim: number): "teal" | "amber" | "rose" {
  return sim >= 80 ? "teal" : sim >= 55 ? "amber" : "rose";
}

export default function PronunciationPractice({
  initialMode = "weak",
  initialTargets = [],
}: {
  initialMode?: PronunciationMode;
  initialTargets?: PronunciationTarget[];
}) {
  const [mode, setMode] = useState<PronunciationMode>(initialMode);
  const [targets, setTargets] = useState<PronunciationTarget[]>(initialTargets);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ttsSupported, setTtsSupported] = useState(true);
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [comparison, setComparison] = useState<SpeechComparison | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const target = targets[index];

  useEffect(() => {
    setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    setRecognitionSupported(getRecognitionCtor() !== null);
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  // Clear feedback when the target changes.
  useEffect(() => {
    setComparison(null);
    setStatus(null);
  }, [index, mode]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    },
    []
  );

  async function loadTargets(nextMode: PronunciationMode) {
    setLoading(true);
    setError(null);
    try {
      const res = await api<TargetsResponse>(`/api/pronunciation/targets?mode=${nextMode}`);
      setTargets(res.targets);
      setIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load targets");
    } finally {
      setLoading(false);
    }
  }

  function chooseMode(next: PronunciationMode) {
    if (next === mode) return;
    setMode(next);
    void loadTargets(next);
  }

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || !target) return;
    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setComparison(compareSpokenText(target.text, transcript));
      setStatus(null);
    };
    recognition.onerror = (e) => {
      setStatus(
        e.error === "no-speech"
          ? "Didn't catch that — try again."
          : e.error === "not-allowed"
            ? "Microphone permission was denied."
            : "Speech recognition error — try again."
      );
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setComparison(null);
    setStatus("Listening… say it out loud.");
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  }, [target]);

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function go(delta: number) {
    setIndex((i) => Math.min(targets.length - 1, Math.max(0, i + delta)));
  }

  /* ---------------- States ---------------- */
  if (loading) {
    return (
      <GlassCard className="mx-auto max-w-xl p-8">
        <Spinner label="Loading targets…" />
      </GlassCard>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold">Pronunciation practice</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-ink-muted">
          Listen to each word or sentence, then say it out loud. Your speech is recognised and compared
          locally in your browser — nothing is sent to any speech service.
        </p>
      </div>

      {/* Mode switcher */}
      <nav aria-label="Pronunciation mode" className="flex flex-wrap justify-center gap-2">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            onClick={() => chooseMode(m.mode)}
            aria-pressed={mode === m.mode}
            title={m.hint}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === m.mode
                ? "border-violet-glow/60 bg-violet-glow/20 text-violet-100"
                : "border-white/15 bg-white/5 text-ink-muted hover:bg-white/10"
            }`}
          >
            {m.label}
          </button>
        ))}
      </nav>

      {error && <ErrorBanner message={error} />}

      {!recognitionSupported && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Speech recognition is not available in this browser. You can still listen to each word — try
          Chrome or Edge on desktop or Android to practise speaking.
        </div>
      )}

      {targets.length === 0 ? (
        <EmptyState
          title="No pronunciation targets found"
          hint="Add flashcards with examples first. Then pick a mode above to start practising your pronunciation."
          action={<LinkButton href="/cards/new">+ Add flashcards</LinkButton>}
        />
      ) : (
        <>
          {/* Target card */}
          <GlassCard className="p-6 text-center sm:p-8">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <Chip tone="violet">{target.kind}</Chip>
              <span>
                {index + 1} of {targets.length}
              </span>
            </div>

            <p className="mx-auto mt-4 max-w-xl font-display text-2xl font-semibold italic leading-relaxed sm:text-3xl">
              {target.text}
            </p>
            {target.meaning && target.kind !== "sentence" && (
              <p className="mt-2 text-sm text-ink-muted">{target.meaning}</p>
            )}
            {target.translation && (
              <p className="mt-1 text-sm text-teal-200" dir="rtl" lang="ar">{target.translation}</p>
            )}

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="ghost" onClick={() => speak(target.text)} disabled={!ttsSupported}>
                🔊 Listen
              </Button>
              {recognitionSupported &&
                (listening ? (
                  <Button onClick={stopListening} className="!bg-rose-500/80">■ Stop</Button>
                ) : (
                  <Button onClick={startListening}>🎙 Speak</Button>
                ))}
            </div>

            {status && <p className="mt-4 text-sm text-ink-muted" role="status">{status}</p>}
          </GlassCard>

          {/* Feedback */}
          {comparison && <FeedbackPanel comparison={comparison} onRetry={startListening} canRetry={recognitionSupported} />}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => go(-1)} disabled={index === 0}>← Previous</Button>
            <Button variant="ghost" onClick={() => loadTargets(mode)}>New set</Button>
            <Button variant="ghost" onClick={() => go(1)} disabled={index >= targets.length - 1}>Next →</Button>
          </div>
        </>
      )}
    </div>
  );
}

function FeedbackPanel({
  comparison,
  onRetry,
  canRetry,
}: {
  comparison: SpeechComparison;
  onRetry: () => void;
  canRetry: boolean;
}) {
  const tone = simTone(comparison.similarity);
  return (
    <GlassCard className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Result</span>
        <span className="flex items-center gap-2">
          {comparison.exactMatch && <Chip tone="teal">Exact match ✓</Chip>}
          <Chip tone={tone}>{comparison.similarity}% match</Chip>
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${
            tone === "teal" ? "bg-teal-glow" : tone === "amber" ? "bg-amber-400" : "bg-rose-glow"
          }`}
          style={{ width: `${comparison.similarity}%` }}
        />
      </div>

      <p className="text-sm">
        <span className="text-ink-muted">You said: </span>
        <span className="italic">{comparison.recognized || "(nothing heard)"}</span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Matched</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {comparison.matchedWords.length > 0 ? (
              comparison.matchedWords.map((w, i) => <Chip key={`${w}-${i}`} tone="teal">{w}</Chip>)
            ) : (
              <span className="text-xs text-ink-muted">None</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Missed</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {comparison.missingWords.length > 0 ? (
              comparison.missingWords.map((w, i) => <Chip key={`${w}-${i}`} tone="rose">{w}</Chip>)
            ) : (
              <span className="text-xs text-ink-muted">None 🎉</span>
            )}
          </div>
        </div>
      </div>

      {comparison.extraWords.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Extra words</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {comparison.extraWords.map((w, i) => <Chip key={`${w}-${i}`} tone="amber">{w}</Chip>)}
          </div>
        </div>
      )}

      {canRetry && (
        <Button variant="ghost" onClick={onRetry} className="w-full">Try again</Button>
      )}
    </GlassCard>
  );
}
