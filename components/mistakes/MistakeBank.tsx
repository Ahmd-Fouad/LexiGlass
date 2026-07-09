"use client";

import { useMemo, useState } from "react";
import { Chip, GlassCard, LinkButton, Select, difficultyTone } from "@/components/ui";
import { formatDate } from "@/lib/client";
import type { GrammarMistakeItem, VocabMistakeItem } from "@/lib/analytics";

// JSON-safe shapes passed from the server page (dates as ISO strings).
export type VocabMistakeDTO = Omit<VocabMistakeItem, "lastMistakeAt"> & {
  lastMistakeAt: string | null;
};
export type GrammarMistakeDTO = Omit<GrammarMistakeItem, "lastMistakeAt"> & {
  lastMistakeAt: string | null;
};
type MistakeDTO = VocabMistakeDTO | GrammarMistakeDTO;

type Filter = "all" | "recent" | "vocab" | "grammar" | "difficult" | "priority";

const HIGH_PRIORITY_THRESHOLD = 15;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "recent", label: "Recent" },
  { id: "vocab", label: "Vocabulary" },
  { id: "grammar", label: "Grammar" },
  { id: "difficult", label: "Difficult cards" },
  { id: "priority", label: "High priority" },
];

export default function MistakeBank({
  vocab,
  grammar,
}: {
  vocab: VocabMistakeDTO[];
  grammar: GrammarMistakeDTO[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [tag, setTag] = useState("");

  const allTags = useMemo(
    () => [...new Set(vocab.flatMap((m) => m.tags))].sort((a, b) => a.localeCompare(b)),
    [vocab]
  );

  const items = useMemo(() => {
    let list: MistakeDTO[] = [...vocab, ...grammar].sort((a, b) => b.priority - a.priority);
    switch (filter) {
      case "recent":
        list = list.filter((m) => m.isRecent);
        break;
      case "vocab":
        list = list.filter((m) => m.type === "vocab");
        break;
      case "grammar":
        list = list.filter((m) => m.type === "grammar");
        break;
      case "difficult":
        list = list.filter((m) => m.type === "vocab" && m.isDifficult);
        break;
      case "priority":
        list = list.filter((m) => m.priority >= HIGH_PRIORITY_THRESHOLD);
        break;
    }
    if (tag) list = list.filter((m) => m.type === "vocab" && m.tags.includes(tag));
    return list;
  }, [vocab, grammar, filter, tag]);

  const counts: Record<Filter, number> = useMemo(() => {
    const all = [...vocab, ...grammar];
    return {
      all: all.length,
      recent: all.filter((m) => m.isRecent).length,
      vocab: vocab.length,
      grammar: grammar.length,
      difficult: vocab.filter((m) => m.isDifficult).length,
      priority: all.filter((m) => m.priority >= HIGH_PRIORITY_THRESHOLD).length,
    };
  }, [vocab, grammar]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Filter mistakes">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f.id
                ? "border-violet-glow/60 bg-violet-glow/20 text-violet-100"
                : "border-white/15 bg-white/5 text-ink-muted hover:bg-white/10"
            }`}
          >
            {f.label} <span className="opacity-60">{counts[f.id]}</span>
          </button>
        ))}
        {allTags.length > 0 && (
          <div className="w-40">
            <Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Bulk actions */}
      {counts.recent > 0 && (
        <div className="flex flex-wrap justify-center gap-3">
          <LinkButton href="/review?mode=mistakes">Repair recent mistakes</LinkButton>
          <LinkButton href="/quiz/vocab?mode=mistakes" variant="ghost">Quiz me on my mistakes</LinkButton>
        </div>
      )}

      {items.length === 0 ? (
        <GlassCard className="px-6 py-12 text-center">
          <p className="font-display text-xl">Nothing here</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            No mistakes match this filter. Try another filter, or keep practising — this list shrinks as you improve.
          </p>
        </GlassCard>
      ) : (
        <ul className="space-y-3">
          {items.map((m) => (
            <li key={`${m.type}_${m.id}`}>
              {m.type === "vocab" ? <VocabCard item={m} /> : <GrammarCard item={m} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MistakeMeta({ item }: { item: MistakeDTO }) {
  const count = item.type === "vocab" ? item.mistakeCount : item.wrong;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
      {count > 0 && (
        <Chip tone="rose">
          {count} {count === 1 ? "miss" : "misses"}{item.type === "vocab" ? " recently" : ""}
        </Chip>
      )}
      {item.type === "vocab" && item.lapses > 0 && <Chip tone="amber">{item.lapses} lapses</Chip>}
      {item.type === "vocab" && item.accuracy !== null && (
        <Chip tone={item.accuracy < 50 ? "rose" : item.accuracy < 75 ? "amber" : "teal"}>
          {item.accuracy}% right
        </Chip>
      )}
      {item.type === "grammar" && (
        <Chip tone={item.accuracy < 50 ? "rose" : "amber"}>
          {item.accuracy}% right · {item.total} answered
        </Chip>
      )}
      {item.lastMistakeAt && <span>last missed {formatDate(item.lastMistakeAt)}</span>}
      {item.type === "vocab" &&
        item.sources.map((s) => (
          <span key={s} className="rounded-full border border-white/15 px-2 py-0.5 capitalize">
            from {s}
          </span>
        ))}
    </div>
  );
}

function WrongAnswerDetail({ detail }: { detail: NonNullable<MistakeDTO["lastWrongAnswer"]> }) {
  return (
    <div className="mt-3 rounded-xl bg-white/5 px-4 py-3 text-sm">
      <p className="text-ink-muted">{detail.question}</p>
      <p className="mt-1.5">
        Your answer: <span className="text-rose-200">{detail.userAnswer}</span>
        {" · "}Correct: <span className="text-teal-200">{detail.correctAnswer}</span>
      </p>
    </div>
  );
}

function VocabCard({ item }: { item: VocabMistakeDTO }) {
  const practiceMode = item.isRecent ? "mistakes" : "weak";
  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold italic">{item.title}</p>
          <p className="mt-0.5 text-sm text-ink-muted">{item.meaning}</p>
          {item.translation && (
            <p className="mt-0.5 text-sm text-teal-200" dir="rtl" lang="ar">{item.translation}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Chip tone="violet">{item.kind}</Chip>
          <Chip tone={difficultyTone(item.difficulty)}>{item.difficulty}</Chip>
        </div>
      </div>

      {item.example && <p className="mt-2 text-sm italic text-ink-muted">“{item.example}”</p>}
      <div className="mt-3">
        <MistakeMeta item={item} />
      </div>
      {item.lastWrongAnswer && <WrongAnswerDetail detail={item.lastWrongAnswer} />}

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href={`/review?mode=${practiceMode}`} variant="ghost" className="!px-3.5 !py-1.5 !text-xs">
          Review now
        </LinkButton>
        <LinkButton href={`/quiz/vocab?mode=${practiceMode}`} variant="ghost" className="!px-3.5 !py-1.5 !text-xs">
          Practice quiz
        </LinkButton>
        <LinkButton href={`/cards/${item.id}/edit`} variant="ghost" className="!px-3.5 !py-1.5 !text-xs">
          Open card
        </LinkButton>
      </div>
    </GlassCard>
  );
}

function GrammarCard({ item }: { item: GrammarMistakeDTO }) {
  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold">{item.title}</p>
          <p className="mt-0.5 text-sm text-ink-muted">Grammar topic</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Chip tone="violet">grammar</Chip>
          <Chip tone={difficultyTone(item.difficulty)}>{item.difficulty}</Chip>
        </div>
      </div>

      <div className="mt-3">
        <MistakeMeta item={item} />
      </div>
      {item.lastWrongAnswer && <WrongAnswerDetail detail={item.lastWrongAnswer} />}

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href="/quiz/grammar" variant="ghost" className="!px-3.5 !py-1.5 !text-xs">
          Practice quiz
        </LinkButton>
        <LinkButton href={`/grammar/${item.id}/edit`} variant="ghost" className="!px-3.5 !py-1.5 !text-xs">
          Open topic
        </LinkButton>
      </div>
    </GlassCard>
  );
}
