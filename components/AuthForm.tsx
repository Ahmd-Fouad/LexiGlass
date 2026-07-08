"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, ErrorBanner, Field, GlassCard, Input } from "@/components/ui";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", body: { name, email, password } });
      // Full navigation so the new session cookie applies everywhere at once.
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="rise-in w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-5xl font-semibold tracking-tight">
            Lexi<span className="bg-gradient-to-r from-violet-glow to-teal-glow bg-clip-text text-transparent">Glass</span>
          </h1>
          <p className="mt-3 text-ink-muted">
            {mode === "login" ? "Welcome back. Your words are waiting." : "Start building your English word collection."}
          </p>
        </div>

        <GlassCard className="p-6 sm:p-8">
          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <Field label="Name" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required maxLength={100} />
              </Field>
            )}
            <Field label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </Field>
            <Field label="Password" required hint={mode === "register" ? "At least 8 characters" : undefined}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={mode === "register" ? 8 : undefined}
              />
            </Field>

            {error && <ErrorBanner message={error} />}

            <Button type="submit" disabled={busy} className="w-full !py-3">
              {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-muted">
            {mode === "login" ? (
              <>No account yet? <Link href="/register" className="font-semibold text-violet-200 hover:underline">Create one</Link></>
            ) : (
              <>Already have an account? <Link href="/login" className="font-semibold text-violet-200 hover:underline">Sign in</Link></>
            )}
          </p>
        </GlassCard>

        <p className="mt-6 text-center text-xs text-ink-muted/70">
          Try the demo account: demo@lexiglass.app / demo1234
        </p>
      </div>
    </main>
  );
}
