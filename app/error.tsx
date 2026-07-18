"use client";

import { useEffect } from "react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("A page failed to render", error.digest ?? error.name);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6" id="main-content">
      <section className="glass-card w-full p-8 text-center" role="alert">
        <h1 className="font-display text-3xl text-ink">This page hit a snag</h1>
        <p className="mt-3 text-ink-muted">Your data is safe. Try loading this page again.</p>
        <button className="btn-primary mt-6" onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
