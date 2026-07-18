# 1. Executive Summary

This branch implements a production-candidate security and reliability baseline for LexiGlass without changing its seven-day SRS cap, practice-only quiz retries, ownership rules, phrase matching, hidden fields, PostgreSQL support, or keyless local grammar fallback. Quiz grading and review scheduling are now server-authoritative, transactional, and replay-safe. Sessions are revocable; unsafe browser mutations are same-origin checked; abuse controls are durable; logout removes private offline data; builds no longer download Google Fonts; operational headers, health checks, CI, accessibility navigation, and deployment guidance are present.

This report does **not** declare the branch production-ready. Unit, type, lint, Prisma validation, offline production build, and the registry audit completed locally. The workstation had no `DATABASE_URL`, PostgreSQL tools, or Docker, so PostgreSQL integration and Playwright flows could not complete locally. CI now provisions disposable PostgreSQL and contains those required gates, but that workflow has not run in this local task.

# 2. Initial Baseline

- Branch at start: `main` at `22f531a`.
- Pre-existing workspace changes preserved: modified `package-lock.json`; untracked `LEXIGLASS_PROJECT_REVIEW.md`.
- Initial tests: 291 passed, 0 failed.
- Initial `npx tsc --noEmit`: passed.
- Initial Prisma validation: passed using a non-secret placeholder PostgreSQL URL; package-level Prisma seed configuration emitted a deprecation warning.
- Initial sandbox build: failed because `next/font/google` attempted an inaccessible/network font operation. A network-enabled retry passed.
- Existing E2E coverage: one Mistake Bank flow.
- Existing lint script: absent.
- Existing CI workflow: absent.
- Supported schema provider: PostgreSQL.

# 3. Issues Resolved

- Removed client authority over quiz correctness, answers, question text/type, and source references.
- Prevented duplicate quiz submissions and review actions from applying scores or SRS twice.
- Made quiz answer/SRS/log/mistake writes atomic.
- Replaced client-supplied undo state with complete server snapshots and latest-review enforcement.
- Added durable database-backed rate limiting and endpoint quotas.
- Added session-version revocation and logout-all.
- Added centralized mutation Origin/Referer enforcement and bounded JSON bodies.
- Added logout sync/discard/cancel handling and account-safe IndexedDB clearing.
- Added explicit service-worker update activation and private-cache exclusions.
- Removed the build-time Google Fonts dependency.
- Added Node 22 pinning, Prisma 6 config, lint/type scripts, query bounds, indexes, and JSON schema versioning.
- Added request IDs, redacted structured error logging, security headers, private no-store policy, health/readiness, and error boundaries.
- Added mobile More navigation, skip link, error announcements, starter onboarding, and restored visible dark/light controls.
- Removed stale SQLite instructions and unresolved README conflict markers.

# 4. Architecture Decisions

- `QuizQuestion` is the durable issued-question authority. Public payload and hidden grading data are separated at the API boundary.
- Quiz grading uses server records inside serializable transactions; uniqueness is the final concurrency guard.
- `ReviewLog` is both audit event and idempotency record, holding complete before/after SRS state and a revert marker.
- Rate limiting uses PostgreSQL fixed-window buckets keyed by one-way hashes. Pure decision logic remains deterministic in unit tests.
- JWTs retain the simple cookie architecture but include a database-checked `sessionVersion` for revocation.
- Offline data remains browser-local, account-scoped, explicitly cleared on logout, and never placed in HTTP caches.
- Build typography uses trusted operating-system font stacks rather than downloaded assets.
- PostgreSQL remains the only supported database.

# 5. Database Models and Migrations Added

New/extended models include `QuizQuestion`, expanded `QuizAnswer`, expanded `ReviewLog`, `RateLimitBucket`, `User.sessionVersion`, and `WritingAttempt.schemaVersion`.

Forward-only migrations:

1. `20260718193000_add_authoritative_quiz_questions`
2. `20260718203000_add_review_idempotency_and_snapshots`
3. `20260718213000_add_rate_limits_and_session_version`
4. `20260718223000_add_query_indexes_and_json_version`

The migrations were validated syntactically through Prisma. They were not applied locally because no PostgreSQL database was available. CI applies them to disposable PostgreSQL with `prisma migrate deploy`.

# 6. API Contract Changes

- `POST /api/quiz/start` persists issued question instances and returns IDs plus safe public fields only.
- `POST /api/quiz/answer` accepts `sessionId`, `questionId`, `submissionId`, and `userAnswer`; all grading fields are derived server-side.
- `POST /api/quiz/finish` calculates totals from persisted answers.
- `POST /api/review` requires a stable `clientActionId` and returns the original authoritative result on replay.
- `POST /api/review/sync` returns per-action outcomes and preserves failed/conflicting client actions.
- `POST /api/review/undo` accepts the review identity, not a client-authored prior schedule.
- `POST /api/auth/logout-all` increments the session version and clears the current cookie.
- `GET /api/cards` and `GET /api/grammar` accept capped `limit` and optional `cursor`, returning `nextCursor` while preserving `cards`/`topics` fields.
- `GET /api/health` returns safe liveness/readiness state.
- Errors retain the compatible `error` string and add stable `code`; internal failures add a correlation ID without raw Prisma details.

# 7. Security Changes

- Server-authoritative quiz grading and ownership checks.
- Database-enforced quiz/review idempotency.
- Serializable atomic updates and authoritative undo.
- Database-backed limits for auth, dictionaries, provider tests/generation, quizzes, reviews, sync, and writing.
- HttpOnly/SameSite cookies preserved; Secure remains production-only; session revocation added.
- Central same-origin checks for unsafe API methods.
- Bounded JSON parsing and sensible auth input maxima.
- Request IDs and redacted JSON logs.
- CSP, frame denial, MIME sniff prevention, strict referrer policy, restricted permissions, and production HSTS.
- Authenticated pages/APIs are `private, no-store`; no wildcard CORS was added.
- CSP exception: production currently allows inline scripts and styles for the Next.js runtime/generated styling. `unsafe-eval` is development-only.

# 8. Offline/PWA Changes

- IndexedDB version advanced with a metadata store and explicit migration path.
- Private cards, queued actions, user identity, and sync metadata are cleared on logout.
- Unsynced logout supports sync, confirmed discard, or cancel.
- Account switching clears mismatched prior-account data.
- Sync calls coalesce; conflicts remain queued with useful outcomes.
- Service worker does not cache APIs or authenticated HTML.
- Updates wait until the user activates the update-ready notification.

# 9. Build and Dependency Changes

- Removed `next/font/google`; selected system sans/display stacks preserve the visual hierarchy without outbound build traffic.
- Added Node `22.x` engine and `.nvmrc`.
- Added `prisma.config.ts` for schema/migrations/seed under Prisma 6.
- Added `typecheck`, `lint`, `db:deploy`, and `test:integration` scripts.
- Added a zero-warning static policy scanner without changing the dependency graph.
- Preserved the user's pre-existing `package-lock.json` modification and did not stage it.
- `@emnapi/runtime` was not removed speculatively; clean CI uses `npm ci`.
- Audit: two moderate vulnerabilities in Next's nested PostCSS. The registry's only offered automated fix was a forced breaking downgrade to Next 9, so no force fix was applied.

# 10. Tests Added

- Quiz authority/forgery/grading contract tests.
- Durable review transition and exact undo-state tests.
- Rate-limit boundary, lockout, and identity isolation tests.
- Mutation-origin and bounded-body tests.
- Offline queue/conflict and PWA cache-policy tests.
- Security-header and request-ID tests.
- PostgreSQL integration tests for ownership, unique action IDs, unique question answers, and transaction rollback.
- Playwright core flow for registration, card creation, skip navigation, landmark, mobile More navigation, headers, and logout.
- Existing Mistake Bank E2E fixture migrated to authoritative quiz records.

# 11. CI and Deployment Changes

`.github/workflows/ci.yml` uses Node 22 and PostgreSQL 16, then runs `npm ci`, Prisma generate/validate/deploy, lint/type checks, unit tests, database integration tests, production build, Chromium E2E/accessibility checks, and an audit that fails on high/critical findings. `docs/DEPLOYMENT.md` provides vendor-neutral release, backup, rollback, privacy, quota, and readiness guidance.

# 12. Files Changed

Main areas changed: Prisma schema and four migrations; quiz/review/auth/offline API routes; `QuizRunner`, `ReviewSession`, `AppShell`, service-worker/offline components; auth, authority, idempotency, limiter, request-security, logging, analytics and IndexedDB libraries; root/middleware/Next configuration; CI, tests, environment template, README, engineering guidance, product brief, and deployment/report documentation. Use `git diff --name-status main..production-stabilization` for the exact machine-readable list.

# 13. Commands Run

The task ran Git status/log/branch commands; `npm test`; `npx tsc --noEmit`; `npm run typecheck`; `npm run lint`; `npx prisma validate`; `npx prisma generate`; repeated `npm run build`; `npm run test:integration`; `npm run test:e2e`; `npx playwright install chromium`; and `npm audit --audit-level=high`. Git commits used explicit file lists so the pre-existing lockfile/report remained outside remediation commits.

# 14. Exact Command Results

- Final unit command: 321 tests passed, 0 failed, 86 suites in the last full captured run (the skipped database suite is a separate command).
- `npm run typecheck`: passed.
- `npm run lint`: passed; “Static policy checks passed with zero warnings.”
- `npx prisma validate`: passed; “The schema at prisma\\schema.prisma is valid.”
- `npm run build`: passed offline; 39/39 static-generation steps completed and the health route was included. Webpack emitted non-fatal cache snapshot warnings.
- `npm run test:integration`: suite skipped because `RUN_DB_INTEGRATION`/database were unavailable locally.
- First Playwright run: failed because the pinned Chromium executable was absent.
- Chromium install: succeeded.
- Second Playwright run: did not complete successfully; existing test failed with `Environment variable not found: DATABASE_URL`, and registration displayed the generic error from `PrismaClientInitializationError`. The enclosing command reached its 180-second timeout during retries.
- Sandboxed `npm audit`: registry endpoint unavailable; required escalated retry succeeded.
- Registry audit: 0 high/critical; 2 moderate PostCSS advisories; exit code 0 at `--audit-level=high`.
- No production/development database migration was run.

# 15. Remaining Risks

- Required PostgreSQL integration, migration, concurrency, API ownership, and browser suites have not passed on this workstation; CI must pass before deployment.
- The two moderate PostCSS advisories remain pending a compatible upstream fix.
- CSP inline script/style exceptions remain.
- Email verification, password reset, and recovery are absent.
- Hosting, database vendor, backup/log retention, data residency, alerting, and incident ownership remain operator decisions.
- Some analytics intentionally load the user's current card library; very large accounts may need further database aggregation/pagination work.

# 16. Manual Verification Required

- Apply all migrations to a disposable clone and inspect backfilled quiz/review rows.
- Run two concurrent duplicate quiz and review submissions against PostgreSQL.
- Complete vocabulary and grammar quizzes, undo the latest review, and confirm retry-wrong is practice-only.
- Test offline review, conflict retention, sync/discard/cancel logout, account switching, and service-worker update activation.
- Keyboard-test all major forms, focus movement, mobile More navigation, screen-reader announcements, reduced motion, and both themes.
- Review light/dark contrast and speech controls on supported/unsupported browsers.
- Confirm proxy host/protocol handling, HSTS, CSP console output, logs, quotas, backups, and restore drill.

# 17. Deployment Instructions

Follow `docs/DEPLOYMENT.md`. In summary: provision PostgreSQL; configure `DATABASE_URL`, `AUTH_SECRET`, and exact HTTPS `APP_ORIGIN`; run the full CI workflow; back up; run `npm run db:deploy`; build; start; verify `/api/health`; perform core smoke tests. Never reset, push schema, or seed production automatically.

# 18. Rollback Notes

Deploy the prior application artifact for code rollback. Database changes are forward-only; create compensating migrations where possible. A backup restore is an incident operation that can discard post-backup writes and therefore requires explicit reconciliation. Do not use `prisma migrate reset`.

# 19. Git Commit List

1. `7941539` secure quiz authority and atomic grading
2. `499c0a0` enforce review idempotency and authoritative undo
3. `6767dac` add rate limiting and session hardening
4. `98fd446` secure offline logout and synchronization
5. `d9d7c32` make production builds deterministic
6. `d9cabf5` bound collection queries and harden schema
7. `bdbfad1` standardize logging and security headers
8. `f26479c` improve mobile navigation and onboarding
9. `de80c3d` add CI integration E2E and accessibility gates
10. `959e31c` restore accessible theme controls
11. Documentation commit follows this report.

Nothing was pushed.

# 20. Recommended Next Product Work

First make the new CI green against disposable PostgreSQL, then perform a staging migration/backfill review and manual accessibility/offline pass. After stabilization, prioritize account recovery/email architecture, import/export, operational observability, and large-account analytics improvements. Do not expand optional AI usage until quotas, privacy terms, and operator monitoring are established.
