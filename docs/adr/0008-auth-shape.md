# ADR-0008: Auth.js JWT sessions without a DB adapter; per-request authz

**Status**: Accepted · **Date**: 2026-07-30

## Context

Sign-in is corporate: OIDC SSO primarily, optional LDAP bind fallback, and a
development need to exercise every flow with seeded users before any IdP
exists. The app owns a rich `users` table (office, locale, contact, admin
provenance) that must stay authoritative.

## Decision

- **Auth.js v5, JWT session strategy, no database adapter.** Credentials
  providers don't work with adapter sessions anyway, and we own the users
  table: sign-in only authenticates; `upsertUserFromLogin` caches directory
  attributes (name, department, office hint) on every login. The JWT carries
  only our user id.
- **Authorization reads the DB per request** (`requireUser`/`requireAdmin`),
  never trusts token claims — admin and locale changes apply immediately,
  not at token refresh. Route protection lives in the `(app)` layout and the
  server actions, not in a proxy/middleware file.
- **Provider lineup is env-gated**: OIDC when `OIDC_*` is set (claim names
  mapped via env — corporate IdPs vary), LDAP when `LDAP_*` is set
  (bind-as-user, allowlisted usernames, bounded timeouts), and a dev-login
  provider (seeded users only) that is disabled in production twice —
  provider registration and an env-level hard fail.
- **Identity anchor**: lookup by stable OIDC subject first, then email, so a
  corporate email change updates the row instead of colliding with the
  subject unique index.
- Production refuses to start on the dev `AUTH_SECRET`, a missing
  `DATABASE_URL`, or `DEV_LOGIN_ENABLED=true` (skipped during `next build`,
  which has and needs no secrets).

## Consequences

- Everything was testable end-to-end months before a real IdP: the dev
  provider drove every matching and UI verification.
- A per-request DB read on authz is the price of freshness — negligible
  here.
- Real-IdP OIDC remains the one untested integration; the runbook prescribes
  a throwaway Keycloak before pointing at the corporate IdP.
