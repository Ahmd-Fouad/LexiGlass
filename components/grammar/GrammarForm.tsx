"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, ErrorBanner, Field, GlassCard, Input, Select, TextArea } from "@/components/ui";
import type { GrammarTopicDTO } from "./grammar-dto";

export default function GrammarForm({ topic }: { topic?: GrammarTopicDTO }) {
  const router = useRouter();
  const editing = !!topic;

  const [form, setForm] = useState({
    title: topic?.title ?? "",
    explanation: topic?.explanation ?? "",
    examples: topic?.examples ?? "",
    commonMistakes: topic?.commonMistakes ?? "",
    notes: topic?.notes ?? "",
    tags: topic?.tags ?? "",
    difficulty: topic?.difficulty ?? "medium",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/grammar/${topic.id}`, { method: "PATCH", body: form });
      } else {
        await api("/api/grammar", { method: "POST", body: form });
      }
      router.push("/grammar");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the topic");
      setBusy(false);
    }
  }

  return (
    <GlassCard className="p-6 sm:p-8">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Grammar title" required>
            <Input value={form.title} onChange={set("title")} placeholder="e.g. Present Perfect vs Past Simple" required maxLength={200} />
          </Field>
          <Field label="Difficulty">
            <Select value={form.difficulty} onChange={set("difficulty")}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
          </Field>
        </div>

        <Field label="Explanation" required>
          <TextArea value={form.explanation} onChange={set("explanation")} placeholder="Explain the rule in your own words." required rows={4} />
        </Field>

        <Field label="Examples" hint="One example sentence per line. The grammar quiz uses these to build questions.">
          <TextArea value={form.examples} onChange={set("examples")} placeholder={"I have visited Japan twice.\nShe has just finished her homework."} rows={3} />
        </Field>

        <Field
          label="Common mistakes"
          hint={'One per line, in the form: wrong sentence => correct sentence. These become "correct the sentence" quiz questions.'}
        >
          <TextArea value={form.commonMistakes} onChange={set("commonMistakes")} placeholder={"I have seen him yesterday. => I saw him yesterday."} rows={3} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tags" hint="Comma-separated">
            <Input value={form.tags} onChange={set("tags")} placeholder="tenses, present perfect" />
          </Field>
          <Field label="Notes">
            <Input value={form.notes} onChange={set("notes")} placeholder="Optional extra notes" />
          </Field>
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="flex gap-3">
          <Button type="submit" disabled={busy} className="!px-8">
            {busy ? "Saving…" : editing ? "Save changes" : "Add topic"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </GlassCard>
  );
}
