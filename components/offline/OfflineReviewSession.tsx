"use client";

import { useEffect, useState } from "react";
import { Button, Chip, GlassCard } from "@/components/ui";
import {
  getOfflineReviewCards,
  isOfflineStorageSupported,
  queueOfflineReviewAction,
} from "@/lib/client-offline";
import type { OfflineReviewCard } from "@/lib/offline-review";
import type { Rating } from "@/lib/srs";

const RATINGS: { rating: Rating; label: string; classes: string }[] = [
  { rating: "again", label: "Again", classes: "!border-rose-glow/40 text-rose-200 hover:!bg-rose-glow/15" },
  { rating: "hard", label: "Hard", classes: "!border-amber-400/40 text-amber-200 hover:!bg-amber-400/15" },
  { rating: "good", label: "Good", classes: "!border-teal-glow/40 text-teal-200 hover:!bg-teal-glow/15" },
  { rating: "easy", label: "Easy", classes: "!border-violet-glow/50 text-violet-200 hover:!bg-violet-glow/15" },
];

/**
 * Flip-and-rate review over the cards cached in IndexedDB. Every rating goes
 * into the offline queue (it never talks to the server) and is synced by
 * OfflineSyncPanel / OfflineStatus once a connection is back.
 */
export default function OfflineReviewSession() {
  const [cards, setCards] = useState<OfflineReviewCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    if (!isOfflineStorageSupported()) {
      setUnsupported(true);
      setCards([]);
      return;
    }
    getOfflineReviewCards()
      .then(setCards)
      .catch(() => setCards([]));
  }, []);

  if (cards === null) {
    return <p className="py-10 text-center text-sm text-ink-muted">Loading cached cards…</p>;
  }

  if (unsupported) {
    return (
      <GlassCard className="p-8 text-center">
        <p className="font-display text-2xl">Offline review unavailable</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          This browser doesn&apos;t support the offline storage LexiGlass needs.
        </p>
      </GlassCard>
    );
  }

  if (cards.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <p className="font-display text-2xl">No cards cached yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          Open a review session while online and the cards are saved here automatically for
          offline study.
        </p>
      </GlassCard>
    );
  }

  const card = cards[index];
  const done = index >= cards.length;

  async function rate(rating: Rating) {
    await queueOfflineReviewAction({ flashcardId: card.id, rating }).catch(() => null);
    setQueuedCount((n) => n + 1);
    setFlipped(false);
    setTimeout(() => setIndex((i) => i + 1), 150);
  }

  if (done) {
    return (
      <GlassCard className="mx-auto max-w-xl p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">Offline review</p>
        <p className="mt-2 font-display text-4xl font-semibold">Session complete</p>
        <p className="mt-3 text-ink-muted">
          {cards.length} {cards.length === 1 ? "card" : "cards"} reviewed offline.
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          {queuedCount > 0
            ? `${queuedCount} ${queuedCount === 1 ? "rating is" : "ratings are"} queued and will sync automatically when you're back online.`
            : "Nothing was queued."}
        </p>
        <div className="mt-6">
          <Button
            variant="ghost"
            onClick={() => {
              setIndex(0);
              setFlipped(false);
            }}
          >
            Review again
          </Button>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span className="flex items-center gap-2">
          <Chip tone="amber">Offline review</Chip>
          <span>
            Card {index + 1} of {cards.length}
          </span>
        </span>
        {queuedCount > 0 && <Chip tone="violet">{queuedCount} queued</Chip>}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-glow to-teal-glow transition-all duration-300"
          style={{ width: `${(index / cards.length) * 100}%` }}
        />
      </div>

      <div className="flip-scene">
        <div className={`flip-inner ${flipped ? "flipped" : ""}`}>
          <button
            type="button"
            onClick={() => setFlipped(true)}
            className="flip-face glass relative flex min-h-80 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl p-8 text-center"
            aria-label="Show answer"
          >
            <span className="relative">
              <span className="mb-3 block text-xs uppercase tracking-[0.2em] text-ink-muted">{card.kind}</span>
              <span className="font-display text-4xl font-semibold italic sm:text-5xl">{card.text}</span>
              <span className="mt-8 block text-xs text-ink-muted/70">tap to reveal</span>
            </span>
          </button>

          <div className="flip-back glass flex min-h-80 flex-col items-center justify-center rounded-3xl p-8 text-center">
            <p className="font-display text-2xl font-semibold italic">{card.text}</p>
            <p className="mt-2 text-lg font-medium sm:text-xl">{card.meaning}</p>
            {card.translation && (
              <p className="mt-2 text-lg text-teal-200" dir="rtl" lang="ar">{card.translation}</p>
            )}
            {card.example && (
              <p className="mt-4 max-w-md text-sm italic text-ink-muted">&ldquo;{card.example}&rdquo;</p>
            )}
            {card.notes && <p className="mt-3 max-w-md text-xs text-ink-muted/80">{card.notes}</p>}
          </div>
        </div>
      </div>

      {flipped ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RATINGS.map((r) => (
            <Button key={r.rating} variant="ghost" onClick={() => rate(r.rating)} className={`!py-3 ${r.classes}`}>
              {r.label}
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
