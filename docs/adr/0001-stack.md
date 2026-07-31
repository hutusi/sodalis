# ADR-0001: Stack & deployment shape

**Status**: Accepted · **Date**: 2026-07-30

## Context

Sodalis is an intranet tool for random lunch matching: low traffic, a small
maintaining team, deployed on company infrastructure with Docker but without
managed cloud services. Time-sensitive behavior (10:30 close → 11:00 emails)
needs a background process; nothing needs web-scale.

## Decision

- **Next.js (App Router) + TypeScript + Tailwind/shadcn + Bun** for the app;
  server components and server actions, no client-side data layer.
- **PostgreSQL + Drizzle ORM (postgres-js)** as the only stateful service.
- **No Redis, no message broker, no cron daemon**: queues, locks, scheduling
  and idempotency all use Postgres primitives (outbox table, advisory locks,
  unique indexes, a polling worker).
- **Docker Compose** deployment: postgres + one-shot migrate job + app
  (Node, Next standalone) + worker (Bun).

## Consequences

- One database to operate, back up, and reason about; every coordination
  guarantee is visible in the schema.
- Polling loops (30s tick, 10s outbox) instead of push infrastructure —
  perfectly adequate at this scale, and trivially debuggable.
- If the org later standardizes on a queue/broker, the outbox table is the
  natural seam to bridge from.
- Bun runs TypeScript directly for the worker and scripts; Node runs the
  built Next server (Next's build tooling assumes Node).
