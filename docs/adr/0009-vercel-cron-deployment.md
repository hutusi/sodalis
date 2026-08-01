# ADR-0009: Cron-triggered scheduling for serverless deployment (Vercel)

**Status**: Accepted · **Date**: 2026-08-01

## Context

The primary deployment is intranet Docker Compose (ADR-0001), where a
long-lived worker (ADR-0002) drives a 30s scheduler tick and a 10s outbox
drain. For a public trial deployment on Vercel there is no home for that
daemon: functions are invoked per request and cannot hold the worker's
session advisory lock or its croner loops. ADR-0003 and ADR-0005, however,
already moved every correctness guarantee into Postgres — the tick is
idempotent ("running the tick twice is always harmless") and the outbox
claims with `FOR UPDATE SKIP LOCKED` and writes terminal states
compare-and-set on `status='sending'`.

## Decision

Vercel is an **additive** deployment target; Compose stays primary and the
worker is untouched. On Vercel:

- A route (`/api/cron/tick`) runs one `schedulerTick()` and then drains the
  outbox until empty (bounded passes). It is guarded by a shared secret
  (`Authorization: Bearer <CRON_SECRET>`, constant-time compare) and is
  disabled while `CRON_SECRET` is unset.
- The worker's **session advisory lock is deliberately not ported**. It only
  serialized whole workers as an efficiency measure; concurrent invocations
  are tolerated instead and cost duplicate reads, never duplicate matches or
  emails (partial unique index, xact advisory locks, outbox CAS).
- The trigger is external: a GitHub Actions schedule every 5 minutes
  (`.github/workflows/cron-tick.yml`), because Hobby-plan Vercel Crons are
  daily-only. On Pro, replace it with a per-minute `vercel.json` cron.
- Postgres is Neon via the Vercel Marketplace. The app runs on the **pooled**
  `DATABASE_URL` with `prepare: false` (named prepared statements break
  through PgBouncer transaction pooling); the injected direct
  `DATABASE_URL_UNPOOLED` is consumed only by drizzle-kit, which is
  unreliable over a pooler. The worker's session advisory lock also needs a
  direct connection, but the worker only runs under Compose, where
  `DATABASE_URL` is direct anyway. The pool gains `idle_timeout` (and
  env-tunable size) so idle functions release connections and Neon can
  autosuspend.
- Sign-in for the trial uses the dev-login provider behind a second, loudly
  named flag (`DEV_LOGIN_DANGEROUSLY_ALLOW_IN_PRODUCTION`) since the
  corporate IdP/LDAP are unreachable from Vercel. It still only signs in
  pre-seeded users and never creates accounts.

## Consequences

- Cadence drops from 30s/10s to ~5 min. Matching still lands well inside the
  close→close+3h catch-up window and the 11:00 notify SLA; GitHub cron
  jitter (minutes) is absorbed the same way. The tick's 15-minute SLA
  warning is now suppressed while SMTP is deliberately unconfigured, where
  queued-forever is the intended state, not an incident.
- At-least-once email delivery gets slightly more likely: a function killed
  at `maxDuration` between SMTP accept and the `sent` CAS is re-sent after
  the 10-minute `sending` reclaim — the same window as a worker crash, just
  easier to hit.
- Anyone who knows a seeded email can sign in on the trial deployment. Demo
  data only; tear down or switch to real OIDC before anything sensitive.
- GitHub scheduled workflows auto-disable after 60 days without repo
  activity — acceptable for a trial, one more reason Compose stays primary.
