# Sodalis · 随机午餐

Random lunch matching for colleagues. Employees sign up before 10:30, the
matcher builds cross-department groups of 2–4 per office, and everyone gets
an email with their group, a volunteer host (搭主) and a suggested cafeteria
— so people actually meet colleagues outside their own team.

**Stack**: Next.js (App Router) · TypeScript · Tailwind + shadcn/ui · Bun ·
PostgreSQL + Drizzle · Auth.js (OIDC + optional LDAP) · next-intl (English +
简体中文).

## How it works

- **Signups** — per user × date × activity. Group-size preference ("pairs
  only" vs "2–4 is fine") and a host opt-in. *Standing signups* auto-enroll
  on chosen weekdays; China's holiday calendar is respected, including 调休
  makeup workdays (every-workday selections also run on a working Saturday).
- **Matching** — a worker tick runs per office on office-local time: signup
  closes 10:30, matching + notifications land by 11:00. The engine is pure
  and seeded (reruns are reproducible), penalizes same-department pairs and
  recent repeat matches (14-day half-life), prefers groups of 4, then 3.
- **Hosts** — one volunteer per group, rotated by least-recently-hosted.
  The host's contact is visible to the group; the host creates the chat.
- **Notifications** — transactional outbox + SMTP with retry/backoff.
  WeCom/Feishu/DingTalk can be added later as new Notifier implementations.
- **Admin** — org & cafeterias, activity schedules, holiday calendar,
  run inspection and manual re-runs at `/admin`.

## Local development

```bash
bun install
# Postgres 16 (either your own, or:)
docker compose -f docker/docker-compose.dev.yml up -d   # + Mailpit on :8025
bun run db:migrate
bun run seed --demo        # org, lunch activity, 2026 CN holidays, 30 demo users
DEV_LOGIN_ENABLED=true bun run dev   # sign in as e.g. wang.wei@corp.example.com (admin)
bun run worker             # scheduler + outbox, in a second terminal
bun run check              # tsc + eslint + bun test — the gate for every commit
```

To watch a full matching cycle locally: set the lunch activity's close time
a few minutes ahead in `/admin/activities`, sign a few demo users up on the
dashboard, and keep `bun run worker` running with `SMTP_HOST=localhost
SMTP_PORT=1025` (Mailpit UI at http://localhost:8025).

## Deployment (intranet)

```bash
cp .env.example docker/.env    # fill in at least POSTGRES_PASSWORD, AUTH_SECRET, AUTH_URL
cd docker && docker compose up -d --build
```

Compose starts Postgres, runs migrations as a one-shot job, then the app
(port 3000) and the worker. First-time setup:

1. Seed base data (org structure, lunch activity, holiday calendar):
   `docker compose run --rm worker bun run seed`
2. Put your email in `ADMIN_EMAILS` before your first login, then manage
   cities/offices/cafeterias at `/admin/org`.
3. Register the OIDC client at your IdP (redirect URI
   `{AUTH_URL}/api/auth/callback/oidc`); optionally configure `LDAP_*` as a
   password fallback. Claim/attribute names are mapped via env vars.
4. Keep the holiday calendar current each year: drop the official schedule
   into `data/holidays-cn-<year>.json` and run
   `docker compose run --rm worker bun run holidays:import data/holidays-cn-<year>.json`,
   or edit dates in `/admin/holidays`.

## Repository layout

```
src/app          pages + server actions ((auth)/login, (app)/dashboard·standing·history·profile, admin/)
src/auth         Auth.js providers (OIDC, LDAP, dev-login), claim sync, session guards
src/db           Drizzle schema + client;   drizzle/  generated SQL migrations
src/lib          framework-free core: matching engine, scheduling, calendar, notify, queries
src/worker       long-running process: 30s scheduler tick + 10s outbox dispatch
messages/        UI strings (en, zh-CN);   data/  holiday datasets;   scripts/  seed & import
```

`src/lib`, `src/db` and `src/worker` never import Next.js or React
(lint-enforced) — the worker executes them directly with Bun.
