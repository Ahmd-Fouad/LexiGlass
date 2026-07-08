"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Chip, ErrorBanner, GlassCard, LinkButton } from "@/components/ui";
import type { CardDTO } from "@/components/cards/card-dto";
import type { Rating } from "@/lib/srs";

const RATINGS: { rating: Rating; label: string; detail: string; classes: string }[] = [
  { rating: "again", label: "Again", detail: "today", classes: "!border-rose-glow/40 text-rose-200 hover:!bg-rose-glow/15" },
  { rating: "hard", label: "Hard", detail: "~1 day", classes: "!border-amber-400/40 text-amber-200 hover:!bg-amber-400/15" },
  { rating: "good", label: "Good", detail: "interval ×2.5", classes: "!border-teal-glow/40 text-teal-200 hover:!bg-teal-glow/15" },
  { rating: "easy", label: "Easy", detail: "up to 7 days", classes: "!border-violet-glow/50 text-violet-200 hover:!bg-violet-glow/15" },
];

export default function ReviewSession({ cards, ahead }: { cards: CardDTO[]; ahead: boolean }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ again: 0, hard: 0, good: 0, easy: 0 });

  const card = cards[index];
  const done = index >= cards.length;

  async function rate(rating: Rating) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/review", { method: "POST", body: { flashcardId: card.id, rating } });
      setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
      setFlipped(false);
      // Let the flip animation reset before showing the next card.
      setTimeout(() => setIndex((i) => i + 1), 150);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the review");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const total = cards.length;
    const correct = counts.hard + counts.good + counts.easy;
    return (
      <GlassCard className="rise-in mx-auto max-w-xl p-8 text-center">
        <p className="font-display text-4xl font-semibold">Session complete</p>
        <p className="mt-3 text-ink-muted">
          {total} {total === 1 ? "card" : "cards"} reviewed · {correct} remembered
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Chip tone="rose">Again {counts.again}</Chip>
          <Chip tone="amber">Hard {counts.hard}</Chip>
          <Chip tone="teal">Good {counts.good}</Chip>
          <Chip tone="violet">Easy {counts.easy}</Chip>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton href="/dashboard">Back to dashboard</LinkButton>
          <LinkButton href="/quiz/vocab" variant="ghost">Take a vocab quiz</LinkButton>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>
          Card {index + 1} of {cards.length}
          {ahead && " · reviewing ahead of schedule"}
        </span>
        <span className="flex gap-2">
          <Chip tone="rose">{counts.again}</Chip>
          <Chip tone="teal">{counts.good + counts.easy + counts.hard}</Chip>
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-glow to-teal-glow transition-all duration-300"
          style={{ width: `${(index / cards.length) * 100}%` }}
        />
      </div>

      {/* The card */}
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
              <span className="mt-8 block text-xs text-ink-muted/70">tap to reveal</span>
            </span>
          </button>

          <div className="flip-back glass flex min-h-80 flex-col items-center justify-center rounded-3xl p-8 text-center">
            <p className="text-lg font-medium sm:text-xl">{card.meaning}</p>
            {card.translation && (
              <p className="mt-2 text-lg text-teal-200" dir="rtl" lang="ar">{card.translation}</p>
            )}
            {card.example && (
              <p className="mt-4 max-w-md text-sm italic text-ink-muted">“{card.example}”</p>
            )}
            {card.notes && <p className="mt-3 max-w-md text-xs text-ink-muted/80">{card.notes}</p>}
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Rating buttons */}
      {flipped ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RATINGS.map((r) => (
            <Button
              key={r.rating}
              variant="ghost"
              disabled={busy}
              onClick={() => rate(r.rating)}
              className={`flex-col !gap-0 !py-3 ${r.classes}`}
            >
              <span>{r.label}</span>
              <span className="text-[11px] font-normal opacity-70">{r.detail}</span>
            </Button>
          ))}
        </div>
      ) : (
        <Button variant="ghost" className="w-full !py-3" onClick={() => setFlipped(true)}>
          Show answer
        </Button>
      )}
    </div>
  );
}
