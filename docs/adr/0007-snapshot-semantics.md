# ADR-0007: Snapshot-at-materialization semantics; catch-up cutoff

**Status**: Accepted (documented v1 limitation — see
[issue #2](https://github.com/hutusi/sodalis/issues/2)) · **Date**: 2026-07-31

## Context

Standing signups materialize into concrete rows continuously before close;
signups snapshot the user's office at creation. Worker downtime across the
close instant raises the question review kept returning to: should recovery
reconstruct the exact state *as of close* (which rules existed, which office
each user belonged to)?

## Decision

The system's semantic everywhere is **snapshot at materialization**, not
state-at-close — even in normal operation, rows insert at the first tick of
the day and later rule edits do not propagate to them (`ON CONFLICT DO
NOTHING`; the dashboard is the per-day override). Consequences applied
consistently:

- **Signup rows keep their snapshot office**: profile moves never relocate
  an existing active signup (editing it would race the old office's
  matcher); cancel + rejoin re-snapshots deliberately.
- **Catch-up recovery** materializes only rules **unchanged since close**
  (`updated_at <= closeAt`). A rule edited after close is excluded for that
  day — failing safe beats guessing, and including current state would let
  users create rules after the deadline during downtime.
- **Catch-up uses the user's current office** — they eat where they are
  today; duplication is impossible (user × activity × date unique key) and
  there is no race (insertion happens under the target office's run lock).

Exact close-time reconstruction requires temporal history for rules (and
office assignment). That is real work with a real design (revision table,
query the revision effective at close) and a small payoff: the affected case
is worker downtime spanning close **and** an edit inside that window, and
the cost is one missed or office-shifted lunch. Deferred to issue #2.

## Consequences

- Recovery behavior is deterministic and explainable from timestamps alone.
- A user who edits their standing rule during a worker outage is silently
  skipped that day — bounded, known, and accepted for v1.
