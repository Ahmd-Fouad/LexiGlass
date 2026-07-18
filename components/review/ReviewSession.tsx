"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button, Chip, ErrorBanner, GlassCard, Input, LinkButton } from "@/components/ui";
import type { CardDTO } from "@/components/cards/card-dto";
import { buildClozeFromCard, evaluateCloze, type ClozeResult } from "@/lib/cloze";
import type { Rating } from "@/lib/srs";
import SpeakButton from "@/components/pronunciation/SpeakButton";

const RATINGS: { rating: Rating; label: string; detail: string; key: string; classes: string }[] = [
  { rating: "again", label: "Again", detail: "today", key: "1", classes: "!border-rose-glow/40 text-rose-200 hover:!bg-rose-glow/15" },
  { rating: "hard", label: "Hard", detail: "~1 day", key: "2", classes: "!border-amber-400/40 text-amber-200 hover:!bg-amber-400/15" },
  { rating: "good", label: "Good", detail: "interval ×2.5", key: "3", classes: "!border-teal-glow/40 text-teal-200 hover:!bg-teal-glow/15" },
  { rating: "easy", label: "Easy", detail: "up to 7 days", key: "4", classes: "!border-violet-glow/50 text-violet-200 hover:!bg-violet-glow/15" },
];

interface RatedCard {
  card: CardDTO;
  rating: Rating;
}

interface UndoState {
  reviewLogId: string;
}

interface ReviewResponse {
  card: unknown;
  undo: UndoState;
}

export default function ReviewSession({
  cards,
  ahead,
  modeLabel,
}: {
  cards: CardDTO[];
  ahead: boolean;
  modeLabel: string;
}) {
  const [sessionCards, setSessionCards] = useState(cards);
  const [isWeakRepeat, setIsWeakRepeat] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RatedCard[]>([]);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [clozeEnabled, setClozeEnabled] = useState(true);
  const [clozeInput, setClozeInput] = useState("");
  const [clozeResult, setClozeResult] = useState<ClozeResult | null>(null);
  // Kept across a failed request so a network retry uses the same durable id.
  const pendingAction = useRef<{ id: string; cardId: string; rating: Rating } | null>(null);

  const card = sessionCards[index];
  const done = index >= sessionCards.length;
  // A cloze can be shown when the current card has an example containing the target.
  const cloze = useMemo(
    () => (card && clozeEnabled ? buildClozeFromCard(card) : null),
    [card, clozeEnabled]
  );
  const counts = {
    again: results.filter((r) => r.rating === "again").length,
    hard: results.filter((r) => r.rating === "hard").length,
    good: results.filter((r) => r.rating === "good").length,
    easy: results.filter((r) => r.rating === "easy").length,
  };

  const rate = useCallback(
    async (rating: Rating) => {
      if (busy || done) return;
      setBusy(true);
      setError(null);
      try {
        pendingAction.current ??= { id: crypto.randomUUID(), cardId: card.id, rating };
        const action = pendingAction.current;
        const res = await api<ReviewResponse>("/api/review", {
          method: "POST",
          body: { flashcardId: action.cardId, rating: action.rating, clientActionId: action.id },
        });
        pendingAction.current = null;
        setResults((r) => [...r, { card, rating: action.rating }]);
        setUndo(res.undo);
        setFlipped(false);
        // Let the flip animation reset before showing the next card.
        setTimeout(() => setIndex((i) => i + 1), 150);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the review");
      } finally {
        setBusy(false);
      }
    },
    [busy, done, card]
  );

  const undoLast = useCallback(async () => {
    if (busy || !undo || results.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/review/undo", { method: "POST", body: undo });
      setResults((r) => r.slice(0, -1));
      setUndo(null);
      setIndex((i) => Math.max(0, i - 1));
      setFlipped(true); // come back with the answer visible, ready to re-rate
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo the rating");
    } finally {
      setBusy(false);
    }
  }, [busy, undo, results.length]);

  // Keyboard shortcuts: Space = flip, 1–4 = rate, U = undo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === " ") {
        e.preventDefault();
        if (!done && !flipped) setFlipped(true);
        return;
      }
      if (e.key.toLowerCase() === "u") {
        undoLast();
        return;
      }
      if (!done && flipped) {
        const match = RATINGS.find((r) => r.key === e.key);
        if (match) rate(match.rating);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, flipped, rate, undoLast]);

  // Moving to a new card clears any in-progress cloze attempt.
  useEffect(() => {
    setClozeInput("");
    setClozeResult(null);
  }, [index, sessionCards]);

  function submitCloze() {
    if (!cloze || !card) return;
    setClozeResult(evaluateCloze(clozeInput, card));
    setFlipped(true); // reveal the answer regardless of correctness
  }

  function reviewWeakAgain() {
    const weak = results.filter((r) => r.rating === "again" || r.rating === "hard").map((r) => r.card);
    setSessionCards(weak);
    setIsWeakRepeat(true);
    setResults([]);
    setUndo(null);
    setIndex(0);
    setFlipped(false);
    setError(null);
  }

  /* ---------------- Session summary ---------------- */
  if (done) {
    const total = sessionCards.length;
    const stillWeak = results.filter((r) => r.rating === "again" || r.rating === "hard");
    const backToday = counts.again;
    const backTomorrow = counts.hard;
    const backLater = counts.good + counts.easy;

    return (
      <GlassCard className="rise-in mx-auto max-w-xl p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">{modeLabel}{isWeakRepeat && " · weak cards repeat"}</p>
        <p className="mt-2 font-display text-4xl font-semibold">Session complete</p>
        <p className="mt-3 text-ink-muted">
          {total} {total === 1 ? "card" : "cards"} reviewed · {total - counts.again} remembered
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Chip tone="rose">Again {counts.again}</Chip>
          <Chip tone="amber">Hard {counts.hard}</Chip>
          <Chip tone="teal">Good {counts.good}</Chip>
          <Chip tone="violet">Easy {counts.easy}</Chip>
        </div>

        <p className="mt-5 text-sm text-ink-muted">
          Next up: {backToday > 0 && <>{backToday} back <strong className="text-rose-200">today</strong></>}
          {backToday > 0 && (backTomorrow > 0 || backLater > 0) && " · "}
          {backTomorrow > 0 && <>{backTomorrow} back <strong className="text-amber-200">tomorrow</strong></>}
          {backTomorrow > 0 && backLater > 0 && " · "}
          {backLater > 0 && <>{backLater} in <strong className="text-teal-200">2+ days</strong></>}
          {backToday === 0 && backTomorrow === 0 && backLater === 0 && "nothing scheduled from this session"}
        </p>

        {stillWeak.length > 0 && (
          <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-left text-sm">
            <p className="font-medium text-amber-100">
              Still weak ({stillWeak.length}): {stillWeak.map((r) => r.card.text).join(", ")}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {stillWeak.length > 0 && (
            <Button onClick={reviewWeakAgain}>Review weak again ({stillWeak.length})</Button>
          )}
          <LinkButton href="/dashboard" variant={stillWeak.length > 0 ? "ghost" : "primary"}>
            Back to dashboard
          </LinkButton>
          <LinkButton href="/quiz/vocab" variant="ghost">Take a vocab quiz</LinkButton>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span className="flex items-center gap-2">
          <Chip tone="violet">{modeLabel}{isWeakRepeat && " · repeat"}</Chip>
          <span>
            Card {index + 1} of {sessionCards.length}
            {ahead && " · ahead of schedule"}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setClozeEnabled((v) => !v)}
            aria-pressed={clozeEnabled}
            className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${
              clozeEnabled
                ? "border-violet-glow/50 bg-violet-glow/15 text-violet-100"
                : "border-white/15 bg-white/5 text-ink-muted hover:bg-white/10"
            }`}
            title="Type the missing word from the example before revealing the card"
          >
            ✎ Cloze {clozeEnabled ? "on" : "off"}
          </button>
          {undo && results.length > 0 && (
            <button
              type="button"
              onClick={undoLast}
              disabled={busy}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:bg-white/10 disabled:opacity-50"
              title="Undo last rating (U)"
            >
              ↩ Undo
            </button>
          )}
          <Chip tone="rose">{counts.again}</Chip>
          <Chip tone="teal">{counts.good + counts.easy + counts.hard}</Chip>
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-glow to-teal-glow transition-all duration-300"
          style={{ width: `${(index / sessionCards.length) * 100}%` }}
        />
      </div>

      {/* Cloze challenge (before revealing) or the flip card */}
      {cloze && !flipped ? (
        <GlassCard className="flex min-h-80 flex-col justify-center p-6 sm:p-8">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-ink-muted">
            Fill in the missing {cloze.kind === "phrase" ? "phrase" : "word"}
          </p>
          <p className="mx-auto mt-4 max-w-xl text-center font-display text-xl italic leading-relaxed sm:text-2xl">
            {cloze.sentence}
          </p>
          {card.translation && (
            <p className="mt-3 text-center text-sm text-teal-200" dir="rtl" lang="ar">
              {card.translation}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (clozeInput.trim()) submitCloze();
            }}
            className="mx-auto mt-6 flex w-full max-w-md flex-col gap-3 sm:flex-row"
          >
            <Input
              autoFocus
              value={clozeInput}
              onChange={(e) => setClozeInput(e.target.value)}
              placeholder={cloze.kind === "phrase" ? "Type the full phrase…" : "Type the missing word…"}
              aria-label="Your cloze answer"
            />
            <Button type="submit" disabled={!clozeInput.trim()} className="shrink-0 !px-8">
              Check
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setFlipped(true)}
            className="mx-auto mt-4 text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Skip — just show the answer
          </button>
        </GlassCard>
      ) : (
        <div className="flip-scene">
          <div className={`flip-inner ${flipped ? "flipped" : ""}`}>
            <button
              type="button"
              onClick={() => setFlipped(true)}
              className="flip-face glass relative flex min-h-80 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl p-8 text-center"
              aria-label="Show answer"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex select-none items-center justify-center font-display text-[14rem] font-bold italic text-white/[0.045]"
              >
                {card.text.charAt(0).toUpperCase()}
              </span>
              <span className="relative">
                <span className="mb-3 block text-xs uppercase tracking-[0.2em] text-ink-muted">{card.kind}</span>
                <span className="font-display text-4xl font-semibold italic sm:text-5xl">{card.text}</span>
                {card.pronunciation && <span className="mt-3 block text-sm text-ink-muted">{card.pronunciation}</span>}
                <span className="mt-8 block text-xs text-ink-muted/70">tap or press Space to reveal</span>
              </span>
            </button>

            <div className="flip-back glass flex min-h-80 flex-col items-center justify-center rounded-3xl p-8 text-center">
              <div className="flex items-center justify-center gap-2">
                <p className="font-display text-2xl font-semibold italic">{card.text}</p>
                <SpeakButton text={card.text} label={`Listen to ${card.text}`} />
              </div>
              <p className="mt-2 text-lg font-medium sm:text-xl">{card.meaning}</p>
              {card.translation && (
                <p className="mt-2 text-lg text-teal-200" dir="rtl" lang="ar">{card.translation}</p>
              )}
              {card.example && (
                <p className="mt-4 flex max-w-md items-start justify-center gap-2 text-sm italic text-ink-muted">
                  <span>“{card.example}”</span>
                  <SpeakButton text={card.example} label="Listen to the example" className="mt-0.5 shrink-0" />
                </p>
              )}
              {card.notes && <p className="mt-3 max-w-md text-xs text-ink-muted/80">{card.notes}</p>}
            </div>
          </div>
        </div>
      )}

      {clozeResult && flipped && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            clozeResult.correct
              ? "border-teal-glow/40 bg-teal-glow/10 text-teal-100"
              : "border-rose-glow/40 bg-rose-glow/10 text-rose-100"
          }`}
          role="status"
        >
          {clozeResult.correct ? (
            <p className="font-semibold">Correct — you filled in “{card.text}”.</p>
          ) : (
            <>
              <p className="font-semibold">Not quite.</p>
              <p className="mt-1">
                You wrote “{clozeResult.normalizedAnswer || "(nothing)"}”. Answer:{" "}
                <strong>{card.text}</strong>
              </p>
            </>
          )}
          <p className="mt-1 text-xs opacity-80">
            {clozeResult.correct
              ? "Suggested rating: Good (or better)."
              : "Suggested rating: Again — this counts as a miss."}
          </p>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {/* Rating buttons */}
      {flipped ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RATINGS.map((r) => {
            const suggested = clozeResult
              ? clozeResult.correct
                ? r.rating === "good"
                : r.rating === "again"
              : false;
            return (
              <Button
                key={r.rating}
                variant="ghost"
                disabled={busy}
                onClick={() => rate(r.rating)}
                className={`flex-col !gap-0 !py-3 ${r.classes} ${
                  suggested ? "!bg-white/10 ring-2 ring-violet-glow/60" : ""
                }`}
              >
                <span>{r.label} <kbd className="ml-1 rounded bg-white/10 px-1 text-[10px] font-normal">{r.key}</kbd></span>
                <span className="text-[11px] font-normal opacity-70">{r.detail}</span>
              </Button>
            );
          })}
        </div>
      ) : (
        <Button variant="ghost" className="w-full !py-3" onClick={() => setFlipped(true)}>
          Show answer <kbd className="ml-1 rounded bg-white/10 px-1.5 text-[10px] font-normal">Space</kbd>
        </Button>
      )}
    </div>
  );
}
