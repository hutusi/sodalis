# ADR-0003: DB-driven scheduler; idempotency and locking in Postgres

**Status**: Accepted · **Date**: 2026-07-30

## Context

Matching runs per office on office-local time (signup close 10:30, results by
11:00), must respect a holiday calendar with 调休 makeup workdays, must
survive worker downtime, and must never double-fire. The obvious design —
one cron job per office — keeps schedule state in scheduler memory, which
goes stale when admins edit offices or times and needs bespoke catch-up
logic after downtime.

## Decision

A single 30-second tick derives all due work from the database each pass:
for every active office (city timezone) and activity, it either materializes
standing signups (before close) or triggers matching (close → close+3h
catch-up window). All idempotency lives in the schema, not the process:

- a **partial unique index** on `match_runs (office, activity, date) WHERE
  status IN (pending, running, completed)` makes double-triggering impossible
  (`INSERT … ON CONFLICT DO NOTHING`);
- a **transaction-scoped advisory lock** on (office, activity, date) is held
  by the whole match run and taken by the signup/cancel server actions, which
  re-check the deadline after acquiring it with zero pool queries inside the
  transaction (validating inside the transaction via the global pool caused a
  real 10-connection deadlock, found in review);
- catch-up materialization runs **inside** the locked match transaction, so
  a concurrent run cannot strand freshly materialized rows;
- a session advisory lock serializes whole workers; a 60-second self-check
  exits the process if the lock's connection silently died.

Past the catch-up window a day is deliberately skipped — nobody wants a
lunch match at 15:00.

## Consequences

- Admin edits take effect at the next tick; downtime recovery is the normal
  code path, not a special one; running the tick twice is always harmless.
- The cost is a polling query set every 30s — negligible at this scale.
- Failed runs are retried each tick within the window (the partial index
  ignores `failed`), and remain manually recoverable afterwards via the
  admin re-run, which passes the same materialization inputs.
