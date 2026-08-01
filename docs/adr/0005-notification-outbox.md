# ADR-0005: Transactional outbox with CAS delivery lifecycle

**Status**: Accepted · **Date**: 2026-07-30

## Context

Match results must reach users between 10:30 and 11:00; intranet SMTP relays
are the flakiest component in the chain. Sending inside the matching
transaction would couple the match to relay availability; sending without
persistence loses mail on crashes. Admin re-runs (supersede) add a hard
requirement: obsolete group assignments must not be delivered after the fact.

## Decision

Notifications are rows in an **outbox table**, written in the same
transaction as the match result, fully denormalized (sending needs no
joins), deduplicated by `match:{run}:{user}`. The worker drains it every
10 seconds:

- claim with `FOR UPDATE SKIP LOCKED`, mark `sending`;
- **re-read status immediately before each SMTP send** and skip unless still
  `sending` (a claimed batch takes seconds; cancellations must take effect
  mid-batch);
- every terminal write is **compare-and-set on `status='sending'`** — the
  failure path cannot resurrect a cancelled row, and crash-reclaim (stuck
  `sending` > 10 min) never sees cancelled rows;
- superseding a run cancels its `pending` **and** `sending` rows;
- retries back off at `2^attempts` minutes, giving up into `failed` after 5,
  surfaced per-recipient in the admin run view.

**Known residual window, accepted**: a cancellation landing between the
freshness re-read and SMTP accepting that one message still delivers it
(the row ends `cancelled` though delivered). Eliminating it would require
transactional email, which does not exist.

**Delivery is at-least-once, accepted**: if the process crashes after SMTP
accepts a message but before the `sent` status write, the ten-minute
crash-reclaim re-sends it — a duplicate email. This is inherent to any
outbox over a non-transactional transport; for email the failure mode is
harmless (a human sees the same lunch group twice). A future channel that
needs stronger semantics must dedupe downstream, e.g. keyed on
`dedupe_key` at the provider.

New channels (WeCom/Feishu/DingTalk) are a new `Notifier` implementation
plus an enum value; the lifecycle is channel-agnostic.

## Consequences

- Matching commits regardless of relay health; mail survives worker crashes;
  re-runs cannot double-deliver stale assignments beyond the stated window.
- The delivery-state machine is subtle — it took three review rounds to get
  right, and its behavior is pinned by `scripts/verify/outbox-cancel-mid-batch.ts`
  (runs on a throwaway database; exercised in CI).
