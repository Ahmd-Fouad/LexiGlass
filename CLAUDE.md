# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
npm run build
```

Run a single test file: `node --import tsx --test tests/srs.test.ts`

After schema changes: `npx prisma migrate dev --name meaningful_migration_name && npx prisma generate`

Demo account (after seeding): `demo@lexiglass.app` / `demo1234`

## Database

`prisma/schema.prisma` provider is currently **`postgresql`** (switched from the SQLite default per the README's deployment instructions — set `DATABASE_URL` accordingly). Models: `User`, `Flashcard` (word or phrase, distinguished by `kind`, holds all SRS state), `GrammarTopic`, `QuizSession`/`QuizAnswer`, `ReviewLog` (one row per SRS review), `DictionaryCache` (versioned cache for external lookups, definitions and examples cached separately under `type`), `WritingAttempt` (one saved Writing Practice attempt: `mode`, `promptWords` JSON, `text`, `feedback` JSON, `score`; added by migration `add_writing_attempt`).

## Architecture

**Auth**: JWT session cookie (`lexiglass_session`, `jose`, httpOnly, 30-day expiry) set by `lib/auth.ts`. `middleware.ts` gates all non-API pages (redirects unauthenticated → `/login`, authenticated-on-auth-pages → `/dashboard`); API routes self-check via `requireUserId()` in `lib/auth.ts`, which throws a `Response` (401) caught by `toErrorResponse()` in `lib/api-helpers.ts`.

**Per-user data isolation is load-bearing**: every Prisma query touching user data must scope with `where: { id, userId }`, never `where: { id }` alone. This applies to every read/update/delete/review/quiz/stats query across all API routes.

**Pure logic vs. data-fetching split**: business logic that needs unit testing is written as pure functions with no DB access, then wired to Prisma by a thin fetcher module. This is the pattern for every feature area:
- SRS rating logic: `lib/srs.ts`. Ratings apply via `POST /api/review`, which also returns a pre-rating snapshot so `POST /api/review/undo` can revert the *most recent* rating on a card (rejects if a newer log already exists, or if the caller doesn't own the card).
- Vocab quiz card selection/question generation: `lib/quiz.ts`
- Grammar quiz generation (from user topics + local bank): `lib/grammar-quiz.ts` + `lib/grammar-bank.ts`
- Weakness analytics / Mistake Bank aggregation: `lib/analytics.ts` (pure) ← `lib/learning-data.ts` (DB-scoped fetchers). Surfaced on `/mistakes` (Mistake Bank page) and the Progress page's weakness sections.
- Smart Daily Study Plan: `lib/study-plan.ts` (pure) ← `lib/learning-data.ts`. Surfaced as a dashboard card.
- Cloze practice: `lib/cloze.ts` (pure) — `canCreateCloze` / `createClozePrompt` / `checkClozeAnswer` / `evaluateCloze`. Reuses `normalizeAnswer`/`levenshtein` from `lib/quiz.ts` (one-directional: quiz.ts must **not** import cloze.ts). Used by the vocab quiz (`fill_blank`) and the optional review-mode cloze challenge (`components/review/ReviewSession.tsx`).
- Writing practice: `lib/writing-practice.ts` (pure) — `selectWritingTargets` / `analyzeWritingAttempt` / `scoreWritingAttempt` / `detectTargetUsage`. Page `/writing`; routes `GET /api/writing/targets`, `GET|POST /api/writing/attempts` (POST re-fetches targets by id scoped to the user and re-analyses server-side — client feedback is never trusted).
- Writing analytics: `lib/writing-analytics.ts` (pure) — `buildWritingStats` over stored `WritingAttempt` rows (score + `feedback`/`promptWords` JSON; malformed JSON tolerated) ← `getWritingStats` in `lib/learning-data.ts`. Surfaced as the Progress page's "Writing practice" section. The daily-plan snapshot also carries `writingAttemptsToday`, which drives the plan's `writing` item (recent mistakes → high, weak → medium, due → low; completed once an attempt is saved that day; hidden with no targets).
- Study collections: `lib/collections.ts` (pure) — `getStudyCollections` / `getCollectionCards` / `getCollectionActions`. Filtering only ever returns cards from the caller-provided (user-scoped) array, so it's ownership-safe by construction. Page `/collections`.
- Pronunciation practice: `lib/pronunciation.ts` (pure) — `normalizeSpokenText` / `compareSpokenText` / `calculateSpeechSimilarity` / `getMissingWords` / `getExtraWords` + `selectPronunciationTargets`. Page `/pronunciation`; route `GET /api/pronunciation/targets`. Comparison is 100% local.
- Review/mastery helpers shared across the above: `lib/review.ts`

Keep new features in this shape: pure, testable module in `lib/`, a thin userId-scoped fetcher if it needs the DB, and an API route that just calls `requireUserId()` + the fetcher.

**Active practice modes (browser-only, no paid/AI services)**: Cloze, Writing, Study Collections and Pronunciation are the active-recall practice surfaces, promoted by the dashboard's "Active practice" section. Pronunciation uses browser Web Speech APIs only — `window.speechSynthesis` (TTS, via the reusable `components/pronunciation/SpeakButton.tsx`, which renders nothing without TTS support and is used across the flashcard browser, card form, vocab quiz results, review back face and writing target lists) and `SpeechRecognition`/`webkitSpeechRecognition` (STT), with a graceful listen-only fallback when recognition is unavailable. All scoring/comparison/feedback (cloze checking, writing rules, speech similarity) runs locally — no external speech/AI service. Cloze in review only *suggests* an SRS rating; the user still chooses, so the 7-day interval logic is never overridden automatically.

**Adaptive AI grammar question pool**: grammar quizzes draw from a DB pool of generated questions (`GeneratedGrammarQuestion`) that never blocks quiz start. Providers live in `lib/ai/providers/` (Gemini, Groq, OpenRouter, Cloudflare, HuggingFace, plus an always-available offline `local` generator), each implementing `AIQuizProvider`. `lib/ai/quiz-generator.ts` orchestrates provider order + fallback and the pure pipeline (parse → normalize → validate → dedupe → score → save); `lib/ai/prompt.ts` holds the prompt/parse helpers shared with providers (kept separate to avoid an import cycle). `lib/grammar-question-pool.ts` is the DB lifecycle: `getActiveQuestionsForTopic`, `getQuestionPoolStats`, `retireCorrectQuestion` (correct answers → `mastered`, **never hard-deleted**), `recordWrongGrammarQuestion` (→ `GrammarMistake` for the Mistake Bank), `topUpQuestionPool` (cooldown-guarded, writes `AIGenerationLog`). Quiz start (`/api/quiz/start`) mixes active pool questions with user topics + the local bank and fires a **non-blocking** top-up when low; `/api/quiz/answer` handles retire-on-correct / bank-on-wrong. Routes: `POST /api/grammar/[id]/generate-questions`, `POST /api/grammar/[id]/top-up-questions`, `GET /api/grammar/[id]/question-pool`. UI: `components/grammar/QuestionPoolPanel.tsx` on the grammar edit page. **All provider calls are server-side only; API keys are never sent to the client or stored in the DB.** Everything works with zero keys via the local generator — external providers require `AI_QUIZ_ENABLED=true` plus a provider key (see `.env.example`).

**Smart Definition & Example Assistant** (`components/cards/SmartSuggest.tsx`, inside the Add/Edit Word form): looks up definitions/examples from free keyless sources only, server-side, centralized in `lib/dictionary.ts` and exposed via `GET /api/dictionary/lookup` and `GET /api/dictionary/examples`. Lookup priority — phrases: local dictionary (`lib/local-phrase-dictionary.ts`) → dictionaryapi.dev → FreeDictionaryAPI → Datamuse (labeled "related suggestions", never shown as a definition); single words: dictionaryapi.dev → FreeDictionaryAPI → local fallback examples → Datamuse. Tatoeba supplies example sentences and must match phrase examples on the *exact full phrase* — never fall back to an unrelated sentence containing just one word of a phrase. Results cache in `DictionaryCache`; cache entries carry a version, and bumping it invalidates old low-quality entries. Nothing from this assistant is ever applied to a form field automatically — the user always clicks "Use this definition"/"Use this example".

**Hidden-but-preserved fields**: the Add/Edit Word form intentionally hides the `pronunciation` and `wordType` inputs (and their "Use pronunciation"/"Use as word type" suggestion buttons) per a prior product decision — do not delete the underlying schema fields or delete this hiding without being asked.

## Constraints

- No paid APIs, no AI APIs, anywhere in the app (dictionary/grammar included) unless explicitly requested.
- SRS interval cap is 7 days (`lib/srs.ts`) — don't change without being asked.
- Retry-wrong in quizzes is practice-only; it must not overwrite the saved quiz result.
- UI is dark-only (glassmorphism); keep it mobile-friendly.
