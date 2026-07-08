"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, formatDate } from "@/lib/client";
import { Button, Chip, difficultyTone, EmptyState, ErrorBanner, GlassCard, Input, LinkButton, Select } from "@/components/ui";
import type { GrammarTopicDTO } from "./grammar-dto";

export default function GrammarBrowser({ topics }: { topics: GrammarTopicDTO[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return topics.filter((t) => {
      if (difficulty !== "all" && t.difficulty !== difficulty) return false;
      if (q && !`${t.title} ${t.explanation} ${t.tags}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [topics, search, difficulty]);

  async function remove(topic: GrammarTopicDTO) {
    if (!confirm(`Delete “${topic.title}”?`)) return;
    setDeletingId(topic.id);
    setError(null);
    try {
      await api(`/api/grammar/${topic.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the topic");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard className="flex flex-col gap-3 p-4 sm:flex-row">
        <Input
          type="search"
          placeholder="Search grammar topics…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search grammar topics"
        />
        <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="field sm:w-48" aria-label="Difficulty">
          <option value="all">Any difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </Select>
      </GlassCard>

      {error && <ErrorBanner message={error} />}

      {filtered.length === 0 ? (
        topics.length === 0 ? (
          <EmptyState
            title="No grammar topics yet"
            hint="Save the grammar rules you study — with examples and common mistakes — and the grammar quiz will build questions from them."
            action={<LinkButton href="/grammar/new">+ Add your first topic</LinkButton>}
          />
        ) : (
          <EmptyState title="No topics match" hint="Try a different search term." />
        )
      ) : (
        <ul className="space-y-3">
          {filtered.map((topic) => {
            const open = openId === topic.id;
            const examples = topic.examples.split("\n").map((s) => s.trim()).filter(Boolean);
            const mistakes = topic.commonMistakes.split("\n").map((s) => s.trim()).filter(Boolean);
            const tags = topic.tags.split(",").map((t) => t.trim()).filter(Boolean);
            return (
              <li key={topic.id}>
                <GlassCard hover={!open} className="p-5">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : topic.id)}
                    className="flex w-full items-start justify-between gap-3 text-left"
                    aria-expanded={open}
                  >
                    <div>
                      <p className="font-display text-xl font-medium">{topic.title}</p>
                      {!open && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{topic.explanation}</p>}
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      <Chip tone={difficultyTone(topic.difficulty)}>{topic.difficulty}</Chip>
                      <span className={`text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>⌄</span>
                    </span>
                  </button>

                  {open && (
                    <div className="rise-in mt-4 space-y-4 border-t border-white/10 pt-4 text-sm">
                      <p className="whitespace-pre-wrap leading-relaxed">{topic.explanation}</p>

                      {examples.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-teal-200">Examples</p>
                          <ul className="space-y-1">
                            {examples.map((ex, i) => (
                              <li key={i} className="border-l-2 border-teal-glow/40 pl-3 italic text-ink-muted">{ex}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {mistakes.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-rose-200">Common mistakes</p>
                          <ul className="space-y-1">
                            {mistakes.map((m, i) => {
                              const [wrong, right] = m.split("=>").map((s) => s.trim());
                              return (
                                <li key={i} className="border-l-2 border-rose-glow/40 pl-3">
                                  {right ? (
                                    <>
                                      <span className="text-rose-200 line-through decoration-rose-glow/60">{wrong}</span>
                                      <span className="text-ink-muted"> → </span>
                                      <span className="text-teal-200">{right}</span>
                                    </>
                                  ) : (
                                    <span className="text-ink-muted">{m}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}

                      {topic.notes && <p className="text-xs text-ink-muted">{topic.notes}</p>}

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <span className="flex flex-wrap gap-1.5">
                          {tags.map((t) => <Chip key={t}>{t}</Chip>)}
                          <span className="self-center text-xs text-ink-muted">added {formatDate(topic.createdAt)}</span>
                        </span>
                        <span className="flex gap-2">
                          <Link href={`/grammar/${topic.id}/edit`} className="rounded-lg px-2 py-1 text-sm font-semibold text-violet-200 hover:bg-white/10">
                            Edit
                          </Link>
                          <Button
                            variant="danger"
                            className="!px-2 !py-1 !text-xs"
                            onClick={() => remove(topic)}
                            disabled={deletingId === topic.id}
                          >
                            {deletingId === topic.id ? "…" : "Delete"}
                          </Button>
                        </span>
                      </div>
                    </div>
                  )}
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
