# ADR-0006: Admin-grant provenance — sticky manual, env, reaffirmed group

**Status**: Accepted · **Date**: 2026-07-31

## Context

Admin rights can come from three sources: the `ADMIN_EMAILS` env list, an
IdP group claim (OIDC), or an explicit in-app/DB grant. The naive designs
each fail: "never downgrade" makes IdP revocation meaningless; "recompute
from the current login" lets an LDAP fallback login erase group-derived
admin — or, inverted, lets a removed admin dodge revocation forever by
only ever logging in through LDAP (the user chooses the provider). This
converged over five review rounds, including one where two automated
reviewers demanded opposite behaviors for unknown grants.

## Decision

`users.admin_via` records provenance (`manual` / `env` / `group` / NULL) and
`computeAdmin` (pure, unit-tested) recomputes on every informative login:

1. **`manual` is sticky**: no login signal — presence *or* absence of
   env/group membership — touches it; only an explicit action does.
2. **`env`** is granted/revoked by the list, checkable on any login.
3. **`group` requires reaffirmation**: any login without a positive group
   signal (LDAP, dev, OIDC without group config) revokes it. An SSO admin
   using the LDAP fallback loses admin until their next SSO login —
   deliberate: a transiently under-privileged admin beats a permanently
   over-privileged one.
4. **NULL (unknown) resolves** on the first informative login: env-listed →
   `env`, group-confirmed → `group`, neither (when groups were checkable) →
   revoked. Where reviewers conflicted (preserve vs revoke unknown grants),
   revocability won: a misclassified manual grant is one admin action to
   restore; an unrevocable external grant is a standing hole.

**Migration lesson, paid for twice**: never edit an applied migration
(Drizzle will not re-run it), and never let a migration guess grant
provenance (it has no source of truth — both backfill directions are wrong).
The provenance column ships with no backfill; unknown rows resolve via rule 4.

## Consequences

- Every grant is revocable by its own source; no grant is silently
  permanent; the full matrix is pinned by `src/auth/admin.test.ts`.
- Dev-login never touches admin state (it performs no upsert).
- If simultaneous independent grants ever need *remembering* (a user who is
  both group- and manually-granted, where the manual grant is added while
  group-active), the model would need per-source boolean columns; the sticky
  rule makes that combination behave correctly today without them.
