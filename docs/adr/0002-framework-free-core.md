# ADR-0002: Framework-free core; one codebase for app and worker

**Status**: Accepted · **Date**: 2026-07-30

## Context

The scheduler/outbox worker must run outside the Next.js build (long-lived
process, no HTTP), but shares the domain logic (matching, calendar, queries,
notifications) and the Drizzle schema with the app. Duplicating that logic or
publishing an internal package would be heavy for one repo.

## Decision

`src/lib`, `src/db` and `src/worker` are **framework-free**: an ESLint
`no-restricted-imports` rule forbids `next`, `next/*`, `react`, `server-only`
and `@/app/*` there (sole exemption: `src/lib/utils.ts`, the Tailwind `cn`
helper). The worker executes this core directly with Bun
(`bun run src/worker/index.ts`) — no separate build. The Docker image has two
targets from one build context: `app` (Next standalone on Node) and `worker`
(source + node_modules on Bun); the worker image doubles as the compose
migration runner.

## Consequences

- One source of truth for domain logic; the app and worker cannot drift.
- The boundary is enforced mechanically, not by convention — an accidental
  `next/*` import in `lib/` fails lint, and CI boots the worker as a smoke
  test.
- Email copy lives in `src/lib/notify/templates.ts`, not in the next-intl
  message catalogs, because the worker renders without any framework.
