"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, dueLabel, formatDate } from "@/lib/client";
import { Button, Chip, difficultyTone, EmptyState, ErrorBanner, GlassCard, Input, LinkButton, Select } from "@/components/ui";
import { cardTags, type CardDTO } from "./card-dto";

type StatusFilter = "all" | "due" | "recent" | "weak";

const STATUS_VALUES: StatusFilter[] = ["all", "due", "recent", "weak"];
const DIFFICULTY_VALUES = ["all", "easy", "medium", "hard"];

export default function CardsBrowser({
  cards,
  initialKind,
  initialTag,
  initialDifficulty,
  initialStatus,
  initialSearch,
}: {
  cards: CardDTO[];
  initialKind?: string;
  initialTag?: string;
  initialDifficulty?: string;
  initialStatus?: string;
  initialSearch?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch ?? "");
  const [kind, setKind] = useState(initialKind === "word" || initialKind === "phrase" ? initialKind : "all");
  const [difficulty, setDifficulty] = useState(
    initialDifficulty && DIFFICULTY_VALUES.includes(initialDifficulty) ? initialDifficulty : "all"
  );
  const [tag, setTag] = useState(() => {
    const want = initialTag?.trim().toLowerCase();
    if (!want) return "all";
    // Resolve to the actual tag casing on the cards so the filter select matches.
    const match = [...new Set(cards.flatMap(cardTags))].find((t) => t.toLowerCase() === want);
    return match ?? "all";
  });
  const [status, setStatus] = useState<StatusFilter>(
    STATUS_VALUES.includes(initialStatus as StatusFilter) ? (initialStatus as StatusFilter) : "all"
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allTags = useMemo(
    () => [...new Set(cards.flatMap(cardTags))].sort(),
    [cards]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    return cards.filter((c) => {
      if (kind !== "all" && c.kind !== kind) return false;
      if (difficulty !== "all" && c.difficulty !== difficulty) return false;
      if (tag !== "all" && !cardTags(c).includes(tag)) return false;
      if (status === "due" && new Date(c.dueDate).getTime() > now) return false;
      if (status === "recent" && new Date(c.createdAt).getTime() < weekAgo) return false;
      if (status === "weak") {
        const acc = c.reviewCount > 0 ? c.correctCount / c.reviewCount : 1;
        if (c.reviewCount < 2 || acc >= 0.6) return false;
      }
      if (q) {
        const haystack = `${c.text} ${c.meaning} ${c.translation ?? ""} ${c.tags} ${c.category ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [cards, search, kind, difficulty, tag, status]);

  async function remove(card: CardDTO) {
    if (!confirm(`Delete “${card.text}”? Its review history will be removed too.`)) return;
    setDeletingId(card.id);
    setError(null);
    try {
      await api(`/api/cards/${card.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the card");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <GlassCard className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <Input
          type="search"
          placeholder="Search words, meanings, translations, tags…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="field md:flex-1"
          aria-label="Search cards"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:w-auto">
          <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
            <option value="all">All types</option>
            <option value="word">Words</option>
            <option value="phrase">Phrases</option>
          </Select>
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty">
            <option value="all">Any difficulty</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
          <Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
            <option value="all">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status">
            <option value="all">Any status</option>
            <option value="due">Due for review</option>
            <option value="recent">Added this week</option>
            <option value="weak">Weak (often wrong)</option>
          </Select>
        </div>
      </GlassCard>

      {error && <ErrorBanner message={error} />}
      <p className="px-1 text-sm text-ink-muted">
        {filtered.length} of {cards.length} cards
      </p>

      {filtered.length === 0 ? (
        cards.length === 0 ? (
          <EmptyState
            title="Your collection is empty"
            hint="Add the words and phrases you're learning. They'll come back for review automatically."
            action={<LinkButton href="/cards/new">+ Add your first word</LinkButton>}
          />
        ) : (
          <EmptyState title="No cards match" hint="Try a different search or clear the filters." />
        )
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((card) => {
            const due = dueLabel(card.dueDate);
            const acc = card.reviewCount > 0 ? Math.round((card.correctCount / card.reviewCount) * 100) : null;
            return (
              <li key={card.id}>
                <GlassCard hover className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-2xl font-medium">{card.text}</p>
                      <p className="mt-1 text-sm text-ink-muted">{card.meaning}</p>
                      {card.translation && (
                        <p className="mt-0.5 text-sm text-teal-200" dir="rtl" lang="ar">{card.translation}</p>
                      )}
                    </div>
                    <Chip tone={due.overdue ? "rose" : "neutral"}>{due.text}</Chip>
                  </div>

                  {card.example && (
                    <p className="mt-3 border-l-2 border-violet-glow/40 pl-3 text-sm italic text-ink-muted">
                      {card.example}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Chip tone="violet">{card.wordType ?? card.kind}</Chip>
                    <Chip tone={difficultyTone(card.difficulty)}>{card.difficulty}</Chip>
                    {cardTags(card).map((t) => (
                      <Chip key={t}>{t}</Chip>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-4 text-xs text-ink-muted">
                    <span>
                      {card.reviewCount} reviews{acc !== null && ` · ${acc}% right`} · added {formatDate(card.createdAt)}
                    </span>
                    <span className="flex gap-2">
                      <Link href={`/cards/${card.id}/edit`} className="rounded-lg px-2 py-1 font-semibold text-violet-200 hover:bg-white/10">
                        Edit
                      </Link>
                      <Button
                        variant="danger"
                        className="!px-2 !py-1 !text-xs"
                        onClick={() => remove(card)}
                        disabled={deletingId === card.id}
                      >
                        {deletingId === card.id ? "…" : "Delete"}
                      </Button>
                    </span>
                  </div>
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
