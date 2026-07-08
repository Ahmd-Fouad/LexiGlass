"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button, ErrorBanner, Field, GlassCard, Input, Select, TextArea } from "@/components/ui";
import type { CardDTO } from "./card-dto";
import { DefinitionPanel, ExamplePanel, useSuggestions } from "./SmartSuggest";
import type { DefinitionLookupResult, ExampleLookupResult } from "@/lib/dictionary";

const EMPTY_EXTRAS = {
  pronunciation: "",
  wordType: "",
  notes: "",
  tags: "",
  category: "",
  difficulty: "medium",
};

// Stable empty-result predicates for the suggestion panels.
const noDefinitions = (r: DefinitionLookupResult) =>
  r.suggestions.length === 0 && r.related.length === 0;
const noExamples = (r: ExampleLookupResult) => r.suggestions.length === 0;

export default function CardForm({ card, initialKind }: { card?: CardDTO; initialKind?: string }) {
  const router = useRouter();
  const editing = !!card;
  const textRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    text: card?.text ?? "",
    kind: card?.kind ?? (initialKind === "phrase" ? "phrase" : "word"),
    meaning: card?.meaning ?? "",
    translation: card?.translation ?? "",
    example: card?.example ?? "",
    pronunciation: card?.pronunciation ?? "",
    wordType: card?.wordType ?? "",
    notes: card?.notes ?? "",
    tags: card?.tags ?? "",
    category: card?.category ?? "",
    difficulty: card?.difficulty ?? "medium",
  });
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "save-another" | null>(null);

  // Smart Definition & Example Assistant state (one panel per field).
  const defs = useSuggestions<DefinitionLookupResult>("/api/dictionary/lookup", noDefinitions);
  const examples = useSuggestions<ExampleLookupResult>("/api/dictionary/examples", noExamples);

  // Hide stale suggestion panels when the word/phrase itself changes.
  const termKey = form.text.trim().toLowerCase().replace(/\s+/g, " ");
  const { syncTerm: syncDefsTerm } = defs;
  const { syncTerm: syncExamplesTerm } = examples;
  useEffect(() => {
    syncDefsTerm(termKey);
    syncExamplesTerm(termKey);
  }, [termKey, syncDefsTerm, syncExamplesTerm]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(addAnother: boolean) {
    setError(null);
    setJustSaved(null);
    setBusy(addAnother ? "save-another" : "save");
    try {
      if (editing) {
        await api(`/api/cards/${card.id}`, { method: "PATCH", body: form });
      } else {
        await api("/api/cards", { method: "POST", body: form });
      }
      if (addAnother) {
        setJustSaved(form.text.trim());
        // Keep the chosen type; clear everything else for the next card.
        setForm((f) => ({ ...f, text: "", meaning: "", translation: "", example: "", ...EMPTY_EXTRAS, kind: f.kind }));
        setBusy(null);
        router.refresh();
        textRef.current?.focus();
      } else {
        router.push("/cards");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the card");
      setBusy(null);
    }
  }

  return (
    <GlassCard className="p-6 sm:p-8">
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="space-y-4">
        {/* Essentials */}
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label="Word or phrase" required>
              <Input
                ref={textRef}
                value={form.text}
                onChange={set("text")}
                placeholder="e.g. meticulous / break the ice"
                required
                maxLength={200}
                autoFocus={!editing}
              />
            </Field>
          </div>
          <Field label="Type" required>
            <Select value={form.kind} onChange={set("kind")}>
              <option value="word">Word</option>
              <option value="phrase">Phrase</option>
            </Select>
          </Field>
          <Field label="Difficulty" required>
            <Select value={form.difficulty} onChange={set("difficulty")}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
          </Field>
        </div>

        <div className="relative">
          <Field label="Meaning" required>
            <TextArea
              value={form.meaning}
              onChange={set("meaning")}
              onFocus={() => {
                if (form.text.trim() && !form.meaning.trim() && !defs.hasLoadedFor(form.text)) {
                  defs.scheduleFocusLoad(form.text);
                }
              }}
              onBlur={defs.cancelScheduledLoad}
              placeholder="What does it mean, in English?"
              required
              rows={2}
            />
          </Field>
          <button
            type="button"
            onClick={() => form.text.trim() && defs.load(form.text)}
            disabled={!form.text.trim()}
            className="absolute right-0 top-0 rounded-lg px-2 py-0.5 text-xs font-semibold text-violet-200 hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
          >
            ✨ Suggest definition
          </button>
          <DefinitionPanel
            state={defs.state}
            onDismiss={defs.dismiss}
            onLookupRelated={(word) => defs.load(word, termKey)}
            onUseDefinition={(s) => setForm((f) => ({ ...f, meaning: s.definition }))}
          />
        </div>

        <Field label="Arabic translation">
          <Input value={form.translation} onChange={set("translation")} placeholder="الترجمة العربية (اختياري)" dir="rtl" lang="ar" />
        </Field>

        <div className="relative">
          <Field label="Example sentence" hint="Include the word itself — it's used for fill-in-the-blank quiz questions.">
            <TextArea
              value={form.example}
              onChange={set("example")}
              onFocus={() => {
                if (form.text.trim() && !form.example.trim() && !examples.hasLoadedFor(form.text)) {
                  examples.scheduleFocusLoad(form.text);
                }
              }}
              onBlur={examples.cancelScheduledLoad}
              placeholder="She kept meticulous records of every expense."
              rows={2}
            />
          </Field>
          <button
            type="button"
            onClick={() => form.text.trim() && examples.load(form.text)}
            disabled={!form.text.trim()}
            className="absolute right-0 top-0 rounded-lg px-2 py-0.5 text-xs font-semibold text-violet-200 hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
          >
            ✨ Suggest example
          </button>
          <ExamplePanel
            state={examples.state}
            onDismiss={examples.dismiss}
            onUseExample={(s) => setForm((f) => ({ ...f, example: s.sentence }))}
          />
        </div>

        {/* Pronunciation and word type inputs are hidden for now; the values
            stay in form state so existing cards keep them when edited. */}

        {error && <ErrorBanner message={error} />}
        {justSaved && (
          <p className="rounded-xl border border-teal-glow/40 bg-teal-glow/10 px-4 py-3 text-sm text-teal-100" role="status">
            “{justSaved}” added. Ready for the next one.
          </p>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          <Button type="submit" disabled={busy !== null} className="!px-8">
            {busy === "save" ? "Saving…" : editing ? "Save changes" : "Add card"}
          </Button>
          {!editing && (
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => save(true)}>
              {busy === "save-another" ? "Saving…" : "Save & add another"}
            </Button>
          )}
          <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
