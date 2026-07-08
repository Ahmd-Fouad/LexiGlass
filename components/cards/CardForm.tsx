"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button, ErrorBanner, Field, GlassCard, Input, Select, TextArea } from "@/components/ui";
import type { CardDTO } from "./card-dto";

const EMPTY_EXTRAS = {
  pronunciation: "",
  wordType: "",
  notes: "",
  tags: "",
  category: "",
  difficulty: "medium",
};

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

        <Field label="Meaning" required>
          <TextArea value={form.meaning} onChange={set("meaning")} placeholder="What does it mean, in English?" required rows={2} />
        </Field>

        <Field label="Arabic translation">
          <Input value={form.translation} onChange={set("translation")} placeholder="الترجمة العربية (اختياري)" dir="rtl" lang="ar" />
        </Field>

        <Field label="Example sentence" hint="Include the word itself — it's used for fill-in-the-blank quiz questions.">
          <TextArea value={form.example} onChange={set("example")} placeholder="She kept meticulous records of every expense." rows={2} />
        </Field>

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
