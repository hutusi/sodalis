# Architecture Decision Records

| # | Decision | Status |
|---|---|---|
| [0001](0001-stack.md) | Stack & deployment shape: Next + Bun + Drizzle + Postgres-only coordination | Accepted |
| [0002](0002-framework-free-core.md) | Framework-free core; one codebase for app and worker | Accepted |
| [0003](0003-db-driven-scheduler.md) | DB-driven scheduler tick; idempotency and locking in Postgres | Accepted |
| [0004](0004-matching-engine.md) | Pure seeded matching engine with penalty scoring | Accepted |
| [0005](0005-notification-outbox.md) | Transactional outbox with CAS delivery lifecycle | Accepted |
| [0006](0006-admin-provenance.md) | Admin-grant provenance: sticky manual, env, reaffirmed group | Accepted |
| [0007](0007-snapshot-semantics.md) | Snapshot-at-materialization semantics; catch-up cutoff | Accepted (v1 limitation, see issue #2) |
| [0008](0008-auth-shape.md) | Auth.js JWT sessions without a DB adapter; per-request authz | Accepted |

Format: Status / Date / Context / Decision / Consequences. New decisions get
the next number; superseding an ADR links both ways.
