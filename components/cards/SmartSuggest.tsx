"use client";

// Smart Definition & Example Assistant — client-side suggestion panels used by
// CardForm. Talks only to our own /api/dictionary/* routes (never to external
// APIs directly), debounces focus-triggered loads, and remembers results per
// term for the lifetime of the form so the same term is never re-fetched.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DefinitionLookupResult,
  DictionarySuggestion,
  ExampleLookupResult,
  ExampleSuggestion,
} from "@/lib/dictionary";

export type SuggestStatus = "idle" | "loading" | "success" | "empty" | "error";

export interface SuggestState<T> {
  status: SuggestStatus;
  result: T | null;
  visible: boolean;
  /** Display term the current panel content belongs to. */
  requestedTerm: string;
}

const IDLE_STATE = { status: "idle" as const, result: null, visible: false, requestedTerm: "" };

/** Client-side lookup key — the server normalizes again, this is for dedupe. */
function clientKey(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

const FOCUS_DEBOUNCE_MS = 250;

export function useSuggestions<T>(endpoint: string, isEmptyResult: (result: T) => boolean) {
  const [state, setState] = useState<SuggestState<T>>(IDLE_STATE);
  const sessionCache = useRef(new Map<string, T>());
  const abortRef = useRef<AbortController | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The form-term key the open panel belongs to (related-word lookups keep it).
  const baseKeyRef = useRef("");

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    []
  );

  const load = useCallback(
    (term: string, baseKey?: string) => {
      const key = clientKey(term);
      if (!key) return;
      baseKeyRef.current = baseKey ?? key;

      const cached = sessionCache.current.get(key);
      if (cached) {
        setState({
          status: isEmptyResult(cached) ? "empty" : "success",
          result: cached,
          visible: true,
          requestedTerm: term.trim(),
        });
        return;
      }

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState({ status: "loading", result: null, visible: true, requestedTerm: term.trim() });

      fetch(`${endpoint}?term=${encodeURIComponent(term.trim())}`, { signal: ctrl.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error("lookup failed");
          const data = (await res.json()) as { result: T };
          sessionCache.current.set(key, data.result);
          setState({
            status: isEmptyResult(data.result) ? "empty" : "success",
            result: data.result,
            visible: true,
            requestedTerm: term.trim(),
          });
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          setState({ status: "error", result: null, visible: true, requestedTerm: term.trim() });
        });
    },
    [endpoint, isEmptyResult]
  );

  /** Debounced load used by field-focus triggers (canceled on quick blur). */
  const scheduleFocusLoad = useCallback(
    (term: string) => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
      focusTimer.current = setTimeout(() => load(term), FOCUS_DEBOUNCE_MS);
    },
    [load]
  );

  const cancelScheduledLoad = useCallback(() => {
    if (focusTimer.current) {
      clearTimeout(focusTimer.current);
      focusTimer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    abortRef.current?.abort();
    cancelScheduledLoad();
    setState((s) => ({ ...s, visible: false }));
  }, [cancelScheduledLoad]);

  /** Hides the panel when the word/phrase field changes to a different term. */
  const syncTerm = useCallback((currentKey: string) => {
    if (baseKeyRef.current && baseKeyRef.current !== currentKey) {
      abortRef.current?.abort();
      baseKeyRef.current = "";
      setState(IDLE_STATE);
    }
  }, []);

  const hasLoadedFor = useCallback(
    (term: string) => sessionCache.current.has(clientKey(term)),
    []
  );

  return { state, load, scheduleFocusLoad, cancelScheduledLoad, dismiss, syncTerm, hasLoadedFor };
}

// ---------- Shared panel bits ----------

function Panel({
  title,
  onDismiss,
  children,
}: {
  title: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 rounded-xl border border-violet-glow/25 bg-white/[0.04] p-3" role="region" aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss suggestions"
          className="rounded-lg px-2 py-0.5 text-xs text-ink-muted hover:bg-white/10 hover:text-ink"
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}

function PanelLoading({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 py-1 text-sm text-ink-muted" role="status">
      <span className="size-3.5 animate-spin rounded-full border-2 border-white/20 border-t-violet-glow" />
      {text}
    </p>
  );
}

function PanelError() {
  return (
    <p className="py-1 text-sm text-amber-200">
      Could not fetch suggestions now. You can still enter it manually.
    </p>
  );
}

function SmallButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="btn-ghost inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"
    >
      {children}
    </button>
  );
}

function SourceTag({ source }: { source: string }) {
  return <span className="text-[11px] text-ink-muted/70">from {source}</span>;
}

// ---------- Definition suggestions panel ----------

export function DefinitionPanel({
  state,
  onDismiss,
  onLookupRelated,
  onUseDefinition,
  onUsePronunciation,
  onUseWordType,
}: {
  state: SuggestState<DefinitionLookupResult>;
  onDismiss: () => void;
  onLookupRelated: (word: string) => void;
  onUseDefinition: (s: DictionarySuggestion) => void;
  onUsePronunciation: (phonetic: string) => void;
  onUseWordType: (partOfSpeech: string) => void;
}) {
  if (!state.visible) return null;
  const result = state.result;

  return (
    <Panel title={`Definition suggestions — “${state.requestedTerm}”`} onDismiss={onDismiss}>
      {state.status === "loading" && <PanelLoading text="Looking for definitions..." />}
      {state.status === "error" && <PanelError />}

      {state.status === "empty" && (
        <p className="py-1 text-sm text-ink-muted">
          No suggestion found. Add your own definition manually.
        </p>
      )}

      {state.status === "success" && result && (
        <div className="space-y-2">
          {result.suggestions.map((s) => (
            <div key={s.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-sm leading-snug">{s.definition}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                {s.partOfSpeech && <span className="italic text-violet-200">{s.partOfSpeech}</span>}
                {s.phonetic && <span dir="ltr">{s.phonetic}</span>}
                <SourceTag source={s.source} />
              </div>
              {s.synonyms.length > 0 && (
                <p className="mt-1 text-xs text-teal-200/90">Synonyms: {s.synonyms.join(", ")}</p>
              )}
              {s.antonyms.length > 0 && (
                <p className="mt-0.5 text-xs text-rose-200/90">Antonyms: {s.antonyms.join(", ")}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <SmallButton onClick={() => onUseDefinition(s)}>Use this definition</SmallButton>
                {s.phonetic && (
                  <SmallButton onClick={() => onUsePronunciation(s.phonetic as string)} title="Fill the pronunciation field">
                    Use pronunciation
                  </SmallButton>
                )}
                {s.partOfSpeech && (
                  <SmallButton onClick={() => onUseWordType(s.partOfSpeech as string)} title="Fill the word type field">
                    Use as word type
                  </SmallButton>
                )}
                {s.audioUrl && (
                  <SmallButton
                    onClick={() => {
                      new Audio(s.audioUrl as string).play().catch(() => {});
                    }}
                    title="Play pronunciation audio"
                  >
                    🔊 Play
                  </SmallButton>
                )}
              </div>
            </div>
          ))}

          {!result.exact && result.related.length > 0 && (
            <div>
              {result.suggestions.length === 0 && (
                <p className="mb-1.5 text-sm text-ink-muted">
                  No exact definition found. You can add your own meaning manually.
                </p>
              )}
              <p className="mb-1 text-xs font-semibold text-ink-muted">Related suggestions</p>
              <div className="flex flex-wrap gap-1.5">
                {result.related.map((word) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => onLookupRelated(word)}
                    title={`Look up “${word}”`}
                    className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs text-ink-muted hover:border-violet-glow/50 hover:text-ink"
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ---------- Example suggestions panel ----------

export function ExamplePanel({
  state,
  onDismiss,
  onUseExample,
}: {
  state: SuggestState<ExampleLookupResult>;
  onDismiss: () => void;
  onUseExample: (s: ExampleSuggestion) => void;
}) {
  if (!state.visible) return null;
  const result = state.result;

  return (
    <Panel title={`Example suggestions — “${state.requestedTerm}”`} onDismiss={onDismiss}>
      {state.status === "loading" && <PanelLoading text="Looking for examples..." />}
      {state.status === "error" && <PanelError />}

      {state.status === "empty" && (
        <p className="py-1 text-sm text-ink-muted">
          No suggestion found. Add your own example manually.
        </p>
      )}

      {state.status === "success" && result && (
        <div className="space-y-2">
          {!result.exact && (
            <p className="text-xs text-amber-200/90">
              No exact examples for “{result.term}” — showing sentences with “{result.searchedWord}”.
            </p>
          )}
          {result.suggestions.map((s) => (
            <div key={s.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-sm leading-snug">{s.sentence}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <SmallButton onClick={() => onUseExample(s)}>Use this example</SmallButton>
                <SourceTag source={s.source} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
