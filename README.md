# LexiGlass — English study companion

A full-stack flashcard and grammar study app with a spaced-repetition system, built with **Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Prisma**. Dark glassmorphism UI, real database persistence, and per-user accounts.

## Features

- **Dashboard** — words/phrases/grammar counts, cards due today, weekly reviews, accuracy, streak, mastered count, quick actions.
- **Flashcards** — words and phrases with meaning, Arabic translation, example sentence, pronunciation notes, word type, difficulty, tags, category, and full review history. Add / edit / delete, search, and filters (type, difficulty, tag, due, recently added, weak words).
- **Spaced repetition** — a simplified SM-2. Ratings **Again / Hard / Good / Easy** update each card's ease factor, interval, and next due date. Intervals are **capped at 7 days**, so every card comes back at least once or twice a week. Wrong answers reset a card to due-now.
- **Review mode** — flip-card review of due cards with the four rating buttons.
- **Vocabulary quiz** — ~20 questions per quiz, chosen by priority: due today → previously-wrong → difficult → longest-unreviewed (older cards fill the rest). Mixed question types: meaning MCQ, reverse MCQ, fill-in-the-blank from the example sentence, true/false. Scores and every answer are saved; wrong answers can be retried as practice.
- **Grammar topics** — title, explanation, examples, common mistakes (`wrong => right` format), notes, tags, difficulty. Add / edit / delete / search.
- **Grammar quiz** — questions generated **from your own topics** (examples become "choose the correct sentence", mistakes become "correct the sentence" / "find the mistake") plus a built-in local bank of ~40 questions that leans toward topics you've studied. No external API, no API keys.
- **Progress page** — daily reviews (14-day chart), accuracy over 6 weeks, most difficult words, mastered count, quiz history, streak.
- **Auth** — email/password accounts (bcrypt-hashed) with signed httpOnly JWT session cookies; every user's data is isolated.

## Getting started

```bash
npm install                 # also runs `prisma generate`
npx prisma migrate dev      # creates prisma/dev.db (SQLite) and applies migrations
npm run db:seed             # optional: demo account with sample data
npm run dev                 # http://localhost:3000
```

Demo account (after seeding): **demo@lexiglass.app / demo1234**

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `file:./dev.db` for SQLite, or a `postgresql://…` URL |
| `AUTH_SECRET` | Long random string that signs session cookies. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

A working `.env` is included for local development — **change `AUTH_SECRET` before deploying** and never commit real secrets.

## Database

Schema lives in [prisma/schema.prisma](prisma/schema.prisma) with migrations under `prisma/migrations/`:

- **User** — account + password hash
- **Flashcard** — content fields + SRS state (easeFactor, intervalDays, dueDate, counts, lapses)
- **GrammarTopic** — explanation, examples, common mistakes, tags
- **QuizSession** / **QuizAnswer** — every quiz and every answered question
- **ReviewLog** — one row per SRS review (feeds charts, accuracy, and streak)

### Switching to Supabase / PostgreSQL

1. In `prisma/schema.prisma` change `provider = "sqlite"` → `provider = "postgresql"`.
2. Set `DATABASE_URL` to your Postgres connection string (Supabase: *Project Settings → Database → Connection string*, use the pooled URL).
3. Run `npx prisma migrate dev --name init-postgres` (fresh DB) and `npm run db:seed`.

No application code changes are needed — everything goes through Prisma.

## Deploying

**Vercel** (recommended):
1. Push the repo to GitHub and import it in Vercel.
2. Use a hosted Postgres database (Supabase, Neon, or Vercel Postgres) — SQLite files don't persist on serverless hosts. Follow the Postgres switch above.
3. Set `DATABASE_URL` and `AUTH_SECRET` in Vercel's environment variables.
4. Run migrations against the production DB: `npx prisma migrate deploy`.

Any Node host (Railway, Render, a VPS) also works: `npm run build && npm start`. On a VPS with a persistent disk, SQLite is fine as-is.

## How the spaced repetition works

Each card keeps an **ease factor** (starts 2.5) and an **interval** in days.

| Rating | Effect |
|---|---|
| Again | interval → 0 (due now), ease −0.2, lapse recorded |
| Hard | interval ×1.2 (min 1 day), ease −0.05 |
| Good | interval × ease (first time: 1 day) |
| Easy | interval × ease ×1.3 (first time: 3 days), ease +0.1 |

Intervals cap at **7 days**. Quiz answers map to ratings automatically (correct → Good, wrong → Again). Implementation: [lib/srs.ts](lib/srs.ts) · quiz card selection: [lib/quiz.ts](lib/quiz.ts).

## Grammar question APIs

There is no reliable, free, keyless public API for grammar quiz questions, so the app ships with a local generator ([lib/grammar-quiz.ts](lib/grammar-quiz.ts)) and question bank ([lib/grammar-bank.ts](lib/grammar-bank.ts)). If you later want AI-generated questions, add a server route that calls the Claude API with your topics as context — keep the key in an env var on the server, never in client code.

## Project structure

```
app/
  (auth)/login, register     auth pages
  (app)/dashboard            stats overview + quick actions
  (app)/cards[, new, edit]   flashcard list, filters, forms
  (app)/review               flip-card SRS review
  (app)/quiz/vocab, grammar  quiz modes
  (app)/grammar[, new, edit] grammar topics
  (app)/stats                progress charts + history
  api/...                    REST endpoints (auth, cards, grammar, review, quiz)
components/                  UI kit, shell, feature components
lib/                         db, auth, srs, quiz builders, stats
prisma/                      schema, migrations, seed
middleware.ts                session check + redirects
```

## Limitations & future ideas

- **Retry-wrong is practice-only** — retries don't overwrite the saved quiz result (by design).
- **Light mode** — the UI is dark-only; the token system in `globals.css` makes a light theme straightforward to add.
- **Audio pronunciation** (text-to-speech), **CSV/Anki import-export**, **per-tag decks**, and **AI-generated grammar questions** would all be natural next steps.
- Sessions last 30 days; there's no password-reset flow yet.
