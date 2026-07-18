# LexiGlass deployment baseline

LexiGlass is vendor-neutral: it requires Node.js 22, npm, HTTPS, and PostgreSQL. The application runs as one public origin; browser mutations are rejected when Origin/Referer does not match `APP_ORIGIN`.

## Release checklist

- Provision a dedicated PostgreSQL database and test its backup/restore procedure.
- Set `DATABASE_URL`, a fresh high-entropy `AUTH_SECRET`, and the exact HTTPS `APP_ORIGIN` in the platform's secret store.
- Keep `AI_QUIZ_ENABLED=false` unless optional provider keys and quotas are intentionally configured.
- Run `npm ci`, `npx prisma generate`, `npx prisma validate`, `npm run lint`, `npm test`, and `npm run build` in CI.
- Against disposable PostgreSQL, run `npm run db:deploy`, `RUN_DB_INTEGRATION=1 npm run test:integration`, and `npm run test:e2e`.
- Take a verified backup immediately before production migrations.
- Apply forward-only migrations with `npm run db:deploy`. Never run `prisma migrate reset` or `prisma db push` in production.
- Start with `npm start`; terminate HTTPS at a trusted proxy and preserve the original host/protocol.
- Verify `GET /api/health` returns 200 and `database: reachable` without connection details.
- Smoke-test login, card creation, review, quiz, logout, headers, mobile navigation, and offline logout handling.
- Never run `npm run db:seed` automatically in production.

## Environment

Required: `DATABASE_URL`, `AUTH_SECRET`, and `APP_ORIGIN`. Optional provider switches/keys and non-secret rate-limit overrides are listed in `.env.example`. Provider keys are server-only and must be rotated through the host's secret store.

## Backups, rollback, and recovery

Use encrypted point-in-time recovery or scheduled logical backups. Define retention to match the privacy policy and perform restore drills before launch and periodically. Application rollback means deploying the previous artifact. Because migrations are forward-only, prefer a compensating migration; restore a pre-release database backup only during a declared incident after accounting for later writes.

## Operations and privacy

Collect structured logs centrally with access controls and a retention policy. Logs contain request IDs and sanitized error names; never add cookies, authorization headers, passwords, user writing, provider keys, or connection strings. Alert on health failures, HTTP 5xx rates, and sustained rate-limit pressure. Expired limiter buckets may be purged routinely.

Private offline study data resides in the browser. Logout warns about unsynced reviews and clears LexiGlass IndexedDB after sync or confirmed discard. API responses and authenticated HTML are `no-store` and excluded from service-worker caches.

External dictionaries are free/keyless. Optional AI providers are disabled by default; if enabled, use conservative database-backed quotas and monitor provider usage. No paid provider is required.

## Open deployment decisions

The operator must choose the Node host, PostgreSQL service, backup/log retention, alerting, secret rotation, data residency, and incident owner. Email verification, password reset, and transactional email are not implemented.

The production CSP permits inline scripts and styles because the current Next.js runtime and generated styling require them. `unsafe-eval` is development-only. Revisit nonce-based CSP when framework support permits it.
