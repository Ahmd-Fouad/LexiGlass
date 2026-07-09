"use client";

import { useState } from "react";
import { api, formatDate } from "@/lib/client";
import { Button, Chip, GlassCard } from "@/components/ui";

export interface ProviderStatusDTO {
  aiEnabled: boolean;
  providerOrder: string[];
  configuredProviders: string[]; // includes "local"
  unconfiguredProviders: string[]; // external only
  lastGenerationProvider: string | null;
  lastGenerationStatus: string | null;
  lastGeneratedAt: string | null;
}

interface TestApiResult {
  provider: string;
  configured: boolean;
  success: boolean;
  responseShapeValid: boolean;
  message: string;
  error?: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  cloudflare: "Cloudflare",
  huggingface: "Hugging Face",
  local: "Local",
};

export default function ProviderStatusPanel({ status }: { status: ProviderStatusDTO }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestApiResult>>({});

  const externalConfigured = status.configuredProviders.filter((p) => p !== "local");

  async function runTest(provider: string) {
    setBusy(provider);
    try {
      const res = await api<TestApiResult>("/api/ai/test-provider", {
        method: "POST",
        body: { provider },
      });
      setResults((r) => ({ ...r, [provider]: res }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [provider]: {
          provider,
          configured: false,
          success: false,
          responseShapeValid: false,
          message: e instanceof Error ? e.message : "Test failed.",
        },
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          AI question generation
        </h2>
        <Chip tone={status.aiEnabled ? "teal" : "amber"}>
          {status.aiEnabled ? "Enabled" : "Disabled"}
        </Chip>
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        Provider order: {status.providerOrder.map((p) => PROVIDER_LABELS[p] ?? p).join(" → ")}
      </p>

      {externalConfigured.length === 0 ? (
        <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          AI generation is not configured with an external provider. LexiGlass will still use the local
          fallback generator.
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          Configured: {externalConfigured.map((p) => PROVIDER_LABELS[p] ?? p).join(", ")}
        </p>
      )}
      {status.unconfiguredProviders.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          Unconfigured: {status.unconfiguredProviders.map((p) => PROVIDER_LABELS[p] ?? p).join(", ")}
        </p>
      )}
      <p className="mt-1 text-xs text-teal-200">Local fallback: Available</p>

      {status.lastGenerationProvider && (
        <p className="mt-2 text-xs text-ink-muted">
          Last generation for this topic:{" "}
          <span className="capitalize">{status.lastGenerationProvider}</span> ·{" "}
          <span className={status.lastGenerationStatus === "success" ? "text-teal-200" : "text-rose-200"}>
            {status.lastGenerationStatus}
          </span>
          {status.lastGeneratedAt && <> · {formatDate(status.lastGeneratedAt)}</>}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {status.providerOrder.map((name) => {
          const configured = status.configuredProviders.includes(name);
          const result = results[name];
          return (
            <div
              key={name}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
            >
              <span className="w-24 shrink-0 font-medium">{PROVIDER_LABELS[name] ?? name}</span>
              <Chip tone={configured ? "teal" : "neutral"}>
                {configured ? "Configured" : "Not configured"}
              </Chip>
              <Button
                variant="ghost"
                className="!px-3 !py-1 !text-xs"
                onClick={() => runTest(name)}
                disabled={busy === name}
              >
                {busy === name ? "Testing…" : "Test provider"}
              </Button>
              {result && (
                <span
                  className={`text-xs ${
                    result.success
                      ? "text-teal-200"
                      : result.configured
                        ? "text-rose-200"
                        : "text-amber-200"
                  }`}
                >
                  {result.message}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
