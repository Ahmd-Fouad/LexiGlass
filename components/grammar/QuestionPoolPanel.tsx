"use client";

import { useState } from "react";
import { api, formatDate } from "@/lib/client";
import { Button, Chip, ErrorBanner, GlassCard, LinkButton } from "@/components/ui";

export interface QuestionPoolStatsDTO {
  active: number;
  retired: number;
  mastered: number;
  wrong: number;
  total: number;
  providers: string[];
  sourceCoverage: { ai: number; local: number };
  lastGeneratedAt: string | null;
}

interface GenResult {
  status: "success" | "skipped" | "failed";
  reason?: string;
  provider: string | null;
  generated: number;
  valid: number;
  saved: number;
  rejected: number;
}

interface GenerateResponse {
  result: GenResult;
  stats: QuestionPoolStatsDTO;
  aiEnabled: boolean;
  externalProviders: string[];
}

export default function QuestionPoolPanel({
  topicId,
  initialStats,
  aiEnabled,
  externalProviders,
}: {
  topicId: string;
  initialStats: QuestionPoolStatsDTO;
  aiEnabled: boolean;
  externalProviders: string[];
}) {
  const [stats, setStats] = useState(initialStats);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const aiConfigured = aiEnabled && externalProviders.length > 0;

  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api<GenerateResponse>(`/api/grammar/${topicId}/generate-questions`, {
        method: "POST",
      });
      setResult(res.result);
      setStats(res.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate questions");
    } finally {
      setBusy(false);
    }
  }

  const tiles = [
    { label: "Active", value: stats.active, tone: "text-teal-200" },
    { label: "Mastered", value: stats.mastered, tone: "text-violet-200" },
    { label: "Mistakes", value: stats.wrong, tone: "text-rose-200" },
    { label: "Total", value: stats.total, tone: "text-ink" },
  ];

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Quiz question pool
        </h2>
        <span className="text-xs text-ink-muted">
          {stats.lastGeneratedAt ? `Last generated ${formatDate(stats.lastGeneratedAt)}` : "Not generated yet"}
        </span>
      </div>

      <p className="mt-1 text-xs text-ink-muted">
        Questions are generated, validated and saved so the grammar quiz can start instantly. Correct
        answers retire questions (kept for history); wrong answers go to your Mistake Bank.
      </p>

      {/* Stat tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-white/5 px-3 py-3 text-center">
            <p className={`text-2xl font-semibold tabular-nums ${t.tone}`}>{t.value}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{t.label}</p>
          </div>
        ))}
      </div>

      {/* Source coverage + providers */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span>Sources:</span>
        <Chip tone="violet">AI-generated {stats.sourceCoverage.ai}</Chip>
        <Chip tone="teal">Local {stats.sourceCoverage.local}</Chip>
        {stats.providers.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            · via {stats.providers.map((p) => (
              <span key={p} className="rounded-full border border-white/15 px-2 py-0.5 capitalize">{p}</span>
            ))}
          </span>
        )}
      </div>

      {/* AI configuration hint */}
      {!aiConfigured && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium">AI generation is not configured.</p>
          <p className="mt-1 text-xs opacity-90">
            Add at least one provider API key (Gemini, Groq, OpenRouter, Cloudflare or Hugging Face)
            and set <code className="rounded bg-black/20 px-1">AI_QUIZ_ENABLED=true</code> to enable it.
            Local question generation still works — the button below builds questions from your
            examples and common mistakes.
          </p>
        </div>
      )}

      {/* Generation result */}
      {result && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            result.saved > 0
              ? "border-teal-glow/40 bg-teal-glow/10 text-teal-100"
              : "border-white/15 bg-white/5 text-ink-muted"
          }`}
          role="status"
        >
          {result.saved > 0 ? (
            <p>
              Added <strong>{result.saved}</strong> question{result.saved === 1 ? "" : "s"}
              {result.provider && <> via <span className="capitalize">{result.provider}</span></>} ·{" "}
              {result.valid} valid · {result.rejected} rejected of {result.generated} generated.
            </p>
          ) : (
            <p>
              No new questions added
              {result.reason ? ` — ${result.reason}` : ""}. {result.generated > 0 && `${result.rejected} rejected. `}
              Try editing the topic's examples and common mistakes, then generate again.
            </p>
          )}
        </div>
      )}

      {error && <div className="mt-4"><ErrorBanner message={error} /></div>}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={generate} disabled={busy} className="!px-5">
          {busy ? "Generating…" : stats.active > 0 ? "Generate more questions" : "Generate quiz questions"}
        </Button>
        <LinkButton href="/quiz/grammar" variant="ghost">Grammar quiz</LinkButton>
        {stats.wrong > 0 && (
          <LinkButton href="/mistakes" variant="ghost">Practice mistakes ({stats.wrong})</LinkButton>
        )}
      </div>
    </GlassCard>
  );
}
