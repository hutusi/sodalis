<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Sodalis project conventions

Read `docs/architecture.md` first; decisions and their rationale live in
`docs/adr/`. Rules that are enforced or have bitten before:

- **Gate**: `bun run check` (tsc + eslint + bun test) must be green before
  every commit. CI enforces the same plus DB integration checks and Docker
  builds.
- **Import boundary** (lint-enforced): nothing under `src/lib`, `src/db`,
  `src/worker` may import `next/*`, `react`, or `@/app/*` — the worker runs
  those modules directly with Bun. Email copy therefore lives in
  `src/lib/notify/templates.ts`, NOT in the next-intl catalogs.
- **Migrations**: `bun run db:generate` after schema edits; never edit an
  applied migration (Drizzle will not re-run it — hash goes stale); never
  write a migration that guesses data semantics (see ADR-0006's backfill
  lesson). Custom SQL: `drizzle-kit generate --custom`.
- **i18n**: every user-facing string goes into BOTH `messages/en.json` and
  `messages/zh-CN.json`; locale comes from a cookie + the user row, not the
  URL.
- **Concurrency invariants** (see the table in `docs/architecture.md`):
  anything touching signups/matching must respect the advisory-lock scheme
  and keep pool queries out of lock-holding transactions; outbox status
  writes must stay compare-and-set on `status='sending'`.
- **DB-dependent verification** lives in `scripts/verify/` as PASS/FAIL
  scripts (run in CI); unit tests must not require Postgres.
- **Commits**: Conventional Commits with a why-explaining body; no
  AI-attribution trailers. Big work branches as `<type>/<topic>` + PR;
  merge commits, no squashing.
