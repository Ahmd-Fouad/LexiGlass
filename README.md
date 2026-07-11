# LexiGlass — English study companion

A full-stack flashcard and grammar study app with a spaced-repetition system, built with **Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Prisma**. Dark glassmorphism UI, real database persistence, and per-user accounts.

## Features

- **Dashboard** — words/phrases/grammar counts, cards due today, weekly reviews, accuracy, streak, mastered count, quick actions.
- **Flashcards** — words and phrases with meaning, Arabic translation, example sentence, pronunciation notes, word type, difficulty, tags, category, and full review history. Add / edit / delete, search, and filters (type, difficulty, tag, due, recently added, weak words).
- **Smart Definition & Example Assistant** — in the Add/Edit Word form, one click (or focusing an empty field) suggests real dictionary definitions and example sentences for the word or phrase you typed, powered entirely by **free, keyless APIs** — no paid AI or dictionary services. Suggestions are never applied automatically; you click "Use this definition" / "Use this example" to fill a field. Lookups are cached in the database so the same term never hits the external APIs twice.
- **Spaced repetition** — a simplified SM-2. Ratings **Again / Hard / Good / Easy** update each card's ease factor, interval, and next due date. Intervals are **capped at 7 days**, so every card comes back at least once or twice a week. Wrong answers reset a card to due-now.
- **Review mode** — flip-card review of due cards with the four rating buttons.
- **Vocabulary quiz** — ~20 questions per quiz, chosen by priority: due today → previously-wrong → difficult → longest-unreviewed (older cards fill the rest). Mixed question types: meaning MCQ, reverse MCQ, fill-in-the-blank from the example sentence, true/false. Scores and every answer are saved; wrong answers can be retried as practice.
- **Grammar topics** — title, explanation, examples, common mistakes (`wrong => right` format), notes, tags, difficulty. Add / edit / delete / search.
- **Grammar quiz** — questions generated **from your own topics** (examples become "choose the correct sentence", mistakes become "correct the sentence" / "find the mistake") plus a built-in local bank of ~40 questions that leans toward topics you've studied. Works fully offline-from-keys; see [Adaptive grammar question pool](#adaptive-grammar-question-pool) for the optional AI-provider top-up.
- **Adaptive grammar question pool** — each topic keeps a pool of generated questions in the database. Correct answers retire a question as "mastered" (never deleted); wrong answers send it to the Mistake Bank and the pool tops itself up in the background. Generation runs through free-tier AI providers (Gemini, Groq, OpenRouter, Cloudflare, Hugging Face) **only if you add a key** — with zero keys, a built-in local generator keeps the pool filled. Keys stay server-side, never in the client or the database.
- **Mistake Bank** (`/mistakes`) — every word, phrase and grammar question you keep getting wrong, worst first, with per-question practice ("practice this mistake" → practiced → resolved, never hard-deleted).
- **Smart Daily Study Plan** — a dashboard checklist built from today's due cards, weak words, recent mistakes, quizzes and writing practice, with time estimates, that checks itself off as you study.
- **Cloze practice** — active recall by typing the target word/phrase back into its own example sentence. Used in the vocabulary quiz (fill-in-the-blank questions) and as an optional challenge in review mode. Phrases require the full phrase; single words tolerate one small typo. Shared logic in [lib/cloze.ts](lib/cloze.ts).
- **Writing practice** (`/writing`) — pick 3–10 target words/phrases (weak / due / recent mistakes / random / by tag / difficult phrases) and write real sentences with them. Your writing is checked **locally with rules** (target usage, complete phrases, word/sentence counts, punctuation, capitalization, repeated words, possible spelling slips) and scored 0–100. Attempts are saved and feed the Progress page (attempts, average/best score, score trend, most-missed targets) and the Smart Daily Study Plan, which adds a writing task for your weak words / recent mistakes / due cards and marks it done once you save an attempt that day. No AI.
- **Study collections** (`/collections`) — ready-made study sets built from your cards: Due today, Weak words, Recent mistakes, Difficult phrases, Mastered, plus auto-generated sets by tag, category and difficulty. Each collection links straight to review, quiz, writing practice, or the filtered card list.
- **Pronunciation practice** (`/pronunciation`) — listen to a word/phrase/sentence (browser text-to-speech), say it out loud, and get a local similarity score with matched / missed / extra words. Uses browser speech APIs only; gracefully falls back to listen-only when speech recognition isn't available.
- **Progress page** — daily reviews (14-day chart), accuracy over 6 weeks, most difficult words, mastered count, quiz history, streak.
- **Auth** — email/password accounts (bcrypt-hashed) with signed httpOnly JWT session cookies; every user's data is isolated.

## Getting started

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # then fill in DATABASE_URL + AUTH_SECRET (see below)
npx prisma migrate dev      # applies migrations to your database
npm run db:seed             # optional: demo account with sample data
npm run dev                 # http://localhost:3000
```

Demo account (after seeding): **demo@lexiglass.app / demo1234**

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | A `postgresql://…` connection string (the schema's provider is PostgreSQL — Supabase, Neon and Vercel Postgres all work). For zero-setup local SQLite instead, see [Using SQLite locally](#using-sqlite-locally). |
| `AUTH_SECRET` | Long random string that signs session cookies. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Copy `.env.example` to `.env` and fill in both values — **use a fresh `AUTH_SECRET` for every deployment** and never commit real secrets.

**Secret handling**: `.env.example` is a template with no real values — it's committed and safe to share. `.env` (and `.env.local` / `.env.*.local`) hold your actual secrets and are gitignored; never commit them. All AI provider API keys are read with `process.env` on the server only (see `lib/ai/providers/`) — they are never sent to the client, never stored in the database, and never logged.

## Database

Schema lives in [prisma/schema.prisma](prisma/schema.prisma) with migrations under `prisma/migrations/`:

- **User** — account + password hash
- **Flashcard** — content fields + SRS state (easeFactor, intervalDays, dueDate, counts, lapses)
- **GrammarTopic** — explanation, examples, common mistakes, tags
- **GeneratedGrammarQuestion** — the per-topic adaptive question pool (provider, status active/mastered/…, quality score, show/answer counters)
- **GrammarMistake** — one wrongly-answered grammar question for the Mistake Bank (active → practiced → resolved, never hard-deleted)
- **AIGenerationLog** — one row per generation attempt (provider, counts, no secrets)
- **QuizSession** / **QuizAnswer** — every quiz and every answered question
- **ReviewLog** — one row per SRS review (feeds charts, accuracy, and streak)
- **DictionaryCache** — cached external dictionary lookups (definitions and examples separately, versioned)
- **WritingAttempt** — one saved Writing Practice attempt (mode, target words, text, rule-based feedback JSON, 0–100 score)

### Using SQLite locally

The schema ships with `provider = "postgresql"` (what the deployed app uses). For a zero-setup local database:

1. In `prisma/schema.prisma` change `provider = "postgresql"` → `provider = "sqlite"`.
2. Set `DATABASE_URL="file:./dev.db"` in `.env`.
3. Delete `prisma/migrations/` (they were generated for Postgres) and run `npx prisma migrate dev --name init-sqlite`, then `npm run db:seed`.

No application code changes are needed — everything goes through Prisma. Just don't commit the provider switch or the regenerated migrations if the deployment still targets Postgres.

## Deploying

**Vercel** (recommended):
1. Push the repo to GitHub and import it in Vercel.
2. Use a hosted Postgres database (Supabase, Neon, or Vercel Postgres) — SQLite files don't persist on serverless hosts. The schema already targets Postgres.
3. Set `DATABASE_URL` and `AUTH_SECRET` in Vercel's environment variables.
4. Run migrations against the production DB: `npx prisma migrate deploy`.

Any Node host (Railway, Render, a VPS) also works: `npm run build && npm start`. On a VPS with a persistent disk, SQLite works too (see [Using SQLite locally](#using-sqlite-locally)).

## How the spaced repetition works

Each card keeps an **ease factor** (starts 2.5) and an **interval** in days.

| Rating | Effect |
|---|---|
| Again | interval → 0 (due now), ease −0.2, lapse recorded |
| Hard | interval ×1.2 (min 1 day), ease −0.05 |
| Good | interval × ease (first time: 1 day) |
| Easy | interval × ease ×1.3 (first time: 3 days), ease +0.1 |

Intervals cap at **7 days**. Quiz answers map to ratings automatically (correct → Good, wrong → Again). Implementation: [lib/srs.ts](lib/srs.ts) · quiz card selection: [lib/quiz.ts](lib/quiz.ts).

## Smart Definition & Example Assistant

The Add/Edit Word form ([components/cards/CardForm.tsx](components/cards/CardForm.tsx)) has a built-in lookup assistant:

1. Type a word or phrase (e.g. `meticulous` or `get rid of`).
2. Focus the **Meaning** field (while it's empty) or click **✨ Suggest definition** — suggestion cards appear below the field with the definition, part of speech, phonetic spelling, synonyms/antonyms, source, and a pronunciation audio button when available. Click **Use this definition** to apply one.
3. Focus the **Example sentence** field or click **✨ Suggest example** to get example sentences, each with a **Use this example** button.
4. Nothing is ever applied or overwritten automatically, and every field stays manually editable (including the Arabic translation, which is never auto-translated).

**Sources** (no API keys, no paid AI/dictionary/TTS/translation services):

| Source | Role |
|---|---|
| Built-in phrase dictionary ([lib/local-phrase-dictionary.ts](lib/local-phrase-dictionary.ts)) | Curated definitions and examples for common phrases/phrasal verbs (`winning formula`, `get rid of`, `figure out`, …) plus curated examples for common study words — checked **first** for phrases |
| [dictionaryapi.dev](https://dictionaryapi.dev) | Primary definitions for single words: part of speech, phonetics, audio, synonyms/antonyms, examples |
| [FreeDictionaryAPI.com](https://freedictionaryapi.com) | Fallback definitions when dictionaryapi.dev has no result |
| [Datamuse](https://www.datamuse.com/api/) | Related words/spelling suggestions when no definition exists anywhere — always shown under a "related suggestions" heading, never as definitions |
| [Tatoeba](https://tatoeba.org) | English example sentences via exact-match search |

**Quality rules**: every example suggestion must contain the target — the exact full phrase for phrases (an example for "winning formula" will never be a sentence that only contains "win"), or a valid form of the word for single words ("restrict" accepts "restricts"/"restricted", exact matches rank first). Sentences are scored (8–22 words ideal, fragments penalized), deduplicated, and the best 3–5 kept. If no exact example exists, the form says so and you write your own.

All external calls happen **server-side only**, centralized in [lib/dictionary.ts](lib/dictionary.ts) and exposed to the form through two internal routes: `GET /api/dictionary/lookup?term=…` and `GET /api/dictionary/examples?term=…`. Results are cached in the `DictionaryCache` table (definitions and examples separately). Cached payloads carry a **cache version** — when lookup logic changes, the version is bumped and old records are ignored and overwritten, so stale low-quality results never linger. If a source is down the next one is tried, and the form always falls back cleanly to manual entry.

Run the assistant's unit tests (parsers, normalization, fallbacks, caching) with `npm test`.

## Adaptive grammar question pool

Grammar quizzes draw from three sources: questions built from **your own topics** ([lib/grammar-quiz.ts](lib/grammar-quiz.ts)), a built-in local bank ([lib/grammar-bank.ts](lib/grammar-bank.ts)), and a per-topic **database pool of generated questions** (`GeneratedGrammarQuestion`).

How the pool behaves:

- **Quiz start never blocks on AI** — it reads whatever is in the pool; if a topic's pool is low, a background top-up (cooldown-guarded) refills it for next time.
- **Correct answers retire a question** as "mastered" (kept for history, never deleted); **wrong answers** go to the Mistake Bank and deprioritise the question.
- **Providers** ([lib/ai/providers/](lib/ai/providers/)): Gemini, Groq, OpenRouter, Cloudflare Workers AI and Hugging Face — all with free tiers — tried in a configurable fallback order, plus an always-available **local rule-based generator**, so everything works with **zero API keys**.
- **Enabling external providers** is opt-in: set `AI_QUIZ_ENABLED="true"` and at least one provider key in `.env` (see [.env.example](.env.example)). The grammar-topic edit page has a per-provider status/test panel and a manual "Generate more questions" button.
- **Keys are server-side only** — read from `process.env` inside API routes, never sent to the client, never stored in the database, never logged.

This is the one optional AI integration in the app; every other feature (dictionary, writing feedback, pronunciation scoring, cloze) is rule-based or uses free keyless sources.

## Project structure

```
app/
  (auth)/login, register     auth pages
  (app)/dashboard            stats overview + quick actions
  (app)/cards[, new, edit]   flashcard list, filters, forms
  (app)/review               flip-card SRS review (with optional cloze)
  (app)/quiz/vocab, grammar  quiz modes
  (app)/grammar[, new, edit] grammar topics
  (app)/collections          topic/status study collections
  (app)/writing              rule-based writing practice
  (app)/pronunciation        browser speech pronunciation practice
  (app)/mistakes             Mistake Bank
  (app)/stats                progress charts + history
  api/...                    REST endpoints (auth, cards, grammar, review, quiz,
<<<<<<< HEAD
                             writing, pronunciation)
components/                  UI kit, shell, feature components
lib/                         db, auth, srs, quiz/cloze/writing/collections/
                             pronunciation logic, analytics, stats
=======
                             dictionary, writing, pronunciation, review/sync,
                             grammar-mistakes, ai/test-provider)
components/                  UI kit, shell, feature components
lib/                         db, auth, srs, quiz/cloze/writing/collections/
                             pronunciation/offline/gamification/reminders/theme
                             logic, analytics, stats
lib/ai/                      grammar-question generation: provider clients +
                             orchestrator (fallback, validate, dedupe, score)
>>>>>>> d2ea08d (Fix quiz answer ownership and provider hardening)
prisma/                      schema, migrations, seed
middleware.ts                session check + redirects
```

## Active practice modes (browser APIs, no paid services)

Pronunciation practice uses only browser-native Web Speech APIs:

- **`window.speechSynthesis`** — text-to-speech for the "Listen" buttons (word, phrase, example sentence, and pronunciation targets).
- **`SpeechRecognition` / `webkitSpeechRecognition`** — captures what you say for the local comparison.

The reusable **SpeakButton** (speechSynthesis-only, hidden automatically when the browser has no TTS) appears wherever hearing a word helps: the flashcard browser (word + example), the review card's back face, vocabulary quiz results (correct answer + example), the Add/Edit Word form (word + example preview), writing-practice target lists, and the pronunciation page itself.

All comparison and scoring (pronunciation similarity, writing feedback, cloze checking) run **locally** — no paid TTS, speech, or AI service is used anywhere. Speech recognition support varies by browser (best in Chrome/Edge on desktop and Android); where it's missing, pronunciation practice stays fully usable in listen-only mode.

## Limitations & future ideas

- **Retry-wrong is practice-only** — retries don't overwrite the saved quiz result (by design).
- **Speech recognition** isn't available in every browser (notably Firefox and iOS Safari at time of writing) — those users get text-to-speech and the listen-only fallback.
- **Cloze suggested ratings** in review are suggestions only — you still choose the SRS rating, so the 7-day interval logic is never overridden automatically.
- **Writing feedback is rule-based**, not grammar-perfect — it catches usage, structure and mechanics issues, not every subtle error (by design: no AI).
- **Light mode** — the UI is dark-only; the token system in `globals.css` makes a light theme straightforward to add.
- **CSV/Anki import-export**, **PWA/offline**, and **study reminders** would all be natural next steps.
- Sessions last 30 days; there's no password-reset flow yet.
