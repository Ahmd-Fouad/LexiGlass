"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-night-900 text-ink">
        <main className="mx-auto flex min-h-screen max-w-xl items-center px-6" id="main-content">
          <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-8 text-center" role="alert">
            <h1 className="text-3xl">LexiGlass could not load</h1>
            <p className="mt-3 text-ink-muted">Please retry. If the problem continues, contact the operator.</p>
            <button className="mt-6 rounded-xl bg-violet-600 px-5 py-3" onClick={reset}>Try again</button>
          </section>
        </main>
      </body>
    </html>
  );
}
