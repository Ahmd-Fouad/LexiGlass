# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

LexiGlass — a full-stack English study companion (flashcards, spaced repetition, quizzes, grammar, progress tracking). Next.js 15 App Router + React 19 + TypeScript + Tailwind v4 + Prisma. Dark glassmorphism UI, per-user accounts, no paid/AI APIs used anywhere in the product.

Full product spec and behavior rules: `LexiGlass_Project_Brief_For_AI.txt`. Read it before working on the Smart Definition/Example Assistant, SRS, or quiz logic — it documents exact scoring/priority rules that are easy to regress.

## Commands

```bash
npm install                 # also runs `prisma generate`
npx prisma migrate dev      # apply/create migrations
npm run db:seed             # tsx prisma/seed.ts — demo account with sample data
npm run dev                 # http://localhost:3000
npm test                    # node --import tsx --test "tests/**/*.test.ts"
npm run typecheck
npm run lint
npm run test:integration    # isolated PostgreSQL + RUN_DB_INTEGRATION=1
npm run test:e2e            # migrated isolated PostgreSQL required
npm run build
```

Run a single test file: `node --import tsx --test tests/srs.test.ts`

After schema changes: `npx prisma migrate dev --name meaningful_migration_name && npx prisma generate`

Demo account (after seeding): `demo@lexiglass.app` / `demo1234`

## Database

`prisma/schema.prisma` uses **PostgreSQL**, the only supported provider. `QuizQuestion` stores server grading authority; `ReviewLog` stores idempotency and authoritative undo snapshots; `RateLimitBucket` provides durable abuse controls. Production releases apply committed migrations with `npm run db:deploy` and never reset or automatically seed production.

## Architecture

**Auth**: JWT session cookie (`lexiglass_session`, `jose`, httpOnly, 30-day expiry) includes a database-checked session version. Middleware gates pages, validates Origin/Referer on unsafe APIs, and attaches request-ID/no-store headers. API routes self-check via `requireUserId()`.

**Quiz/review authority**: quiz start persists `QuizQuestion` rows and returns public payloads only. Quiz answer accepts session/question/submission IDs plus the user's answer, then performs grading, answer persistence, SRS, logs, and mistakes atomically. Question/submission uniqueness prevents replay. Online/offline reviews require a database-unique `clientActionId`; undo restores the latest server snapshot.

**Offline privacy**: IndexedDB records are account-scoped. Logout offers sync/discard/cancel for queued actions and clears only LexiGlass private stores. APIs and authenticated HTML must never enter the service-worker cache.

**Per-user data isolation is load-bearing**: every Prisma query touching user data must scope with `where: { id, userId }`, never `where: { id }` alone. This applies to every read/update/delete/review/quiz/stats query across all API routes.

**Pure logic vs. data-fetching split**: business logic that needs unit testing is written as pure functions with no DB access, then wired to Prisma by a thin fetcher module. This is the pattern for every feature area:
- SRS rating logic: `lib/srs.ts`. Ratings apply via `POST /api/review`, which also returns a pre-rating snapshot so `POST /api/review/undo` can revert the *most recent* rating on a card (rejects if a newer log already exists, or if the caller doesn't own the card).
- Vocab quiz card selection/question generation: `lib/quiz.ts`
- Grammar quiz generation (from user topics + local bank): `lib/grammar-quiz.ts` + `lib/grammar-bank.ts`
- Weakness analytics / Mistake Bank aggregation: `lib/analytics.ts` (pure) ← `lib/learning-data.ts` (DB-scoped fetchers). Surfaced on `/mistakes` (Mistake Bank page) and the Progress page's weakness sections.
- Smart Daily Study Plan: `lib/study-plan.ts` (pure) ← `lib/learning-data.ts`. Surfaced as a dashboard card.
- Review/mastery helpers shared across the above: `lib/review.ts`

Keep new features in this shape: pure, testable module in `lib/`, a thin userId-scoped fetcher if it needs the DB, and an API route that just calls `requireUserId()` + the fetcher.

**Adaptive AI grammar question pool**: grammar quizzes draw from a DB pool of generated questions (`GeneratedGrammarQuestion`) that never blocks quiz start. Providers live in `lib/ai/providers/` (Gemini, Groq, OpenRouter, Cloudflare, HuggingFace, plus an always-available offline `local` generator), each implementing `AIQuizProvider`. `lib/ai/quiz-generator.ts` orchestrates provider order + fallback and the pure pipeline (parse → normalize → validate → dedupe → score → save); `lib/ai/prompt.ts` holds the prompt/parse helpers shared with providers (kept separate to avoid an import cycle). `lib/grammar-question-pool.ts` is the DB lifecycle: `getActiveQuestionsForTopic`, `getQuestionPoolStats`, `retireCorrectQuestion` (correct answers → `mastered`, **never hard-deleted**), `recordWrongGrammarQuestion` (→ `GrammarMistake` for the Mistake Bank), `topUpQuestionPool` (cooldown-guarded, writes `AIGenerationLog`). Quiz start (`/api/quiz/start`) mixes active pool questions with user topics + the local bank and fires a **non-blocking** top-up when low; `/api/quiz/answer` handles retire-on-correct / bank-on-wrong. Routes: `POST /api/grammar/[id]/generate-questions`, `POST /api/grammar/[id]/top-up-questions`, `GET /api/grammar/[id]/question-pool`. UI: `components/grammar/QuestionPoolPanel.tsx` on the grammar edit page. **All provider calls are server-side only; API keys are never sent to the client or stored in the DB.** Everything works with zero keys via the local generator — external providers require `AI_QUIZ_ENABLED=true` plus a provider key (see `.env.example`).

**Smart Definition & Example Assistant** (`components/cards/SmartSuggest.tsx`, inside the Add/Edit Word form): looks up definitions/examples from free keyless sources only, server-side, centralized in `lib/dictionary.ts` and exposed via `GET /api/dictionary/lookup` and `GET /api/dictionary/examples`. Lookup priority — phrases: local dictionary (`lib/local-phrase-dictionary.ts`) → dictionaryapi.dev → FreeDictionaryAPI → Datamuse (labeled "related suggestions", never shown as a definition); single words: dictionaryapi.dev → FreeDictionaryAPI → local fallback examples → Datamuse. Tatoeba supplies example sentences and must match phrase examples on the *exact full phrase* — never fall back to an unrelated sentence containing just one word of a phrase. Results cache in `DictionaryCache`; cache entries carry a version, and bumping it invalidates old low-quality entries. Nothing from this assistant is ever applied to a form field automatically — the user always clicks "Use this definition"/"Use this example".

**Hidden-but-preserved fields**: the Add/Edit Word form intentionally hides the `pronunciation` and `wordType` inputs (and their "Use pronunciation"/"Use as word type" suggestion buttons) per a prior product decision — do not delete the underlying schema fields or delete this hiding without being asked.

## Constraints

- No paid APIs, no AI APIs, anywhere in the app (dictionary/grammar included) unless explicitly requested.
- SRS interval cap is 7 days (`lib/srs.ts`) — don't change without being asked.
- Retry-wrong in quizzes is practice-only; it must not overwrite the saved quiz result.
- Preserve both dark and light glassmorphism themes; keep them mobile-friendly.
