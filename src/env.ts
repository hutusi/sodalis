import { z } from "zod";

/**
 * All environment variables the app and worker read, validated in one place.
 * Optional groups (OIDC, LDAP, SMTP) degrade gracefully: the feature is
 * disabled when its variables are absent, so a partial .env still boots.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().optional(),
  // Connection pool, per process. Serverless deployments size this down and
  // let idle connections close so managed Postgres can autosuspend:
  // postgres-js throws on fractional/negative pool sizes — reject at parse.
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_IDLE_TIMEOUT: z.coerce.number().int().nonnegative().default(20), // seconds; 0 keeps connections open

  // Auth.js
  AUTH_SECRET: z.string().optional(),
  AUTH_URL: z.string().optional(),

  // OIDC SSO (feature-flagged by presence of issuer + client id/secret)
  OIDC_ISSUER: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  // Claim names vary per corporate IdP; map them without code changes.
  OIDC_CLAIM_DEPARTMENT: z.string().default("department"),
  OIDC_CLAIM_OFFICE: z.string().default("office"),
  OIDC_ADMIN_GROUP: z.string().optional(),

  // LDAP fallback (enabled when LDAP_URL is set)
  LDAP_URL: z.string().optional(),
  LDAP_BIND_DN_TEMPLATE: z.string().optional(), // e.g. "uid={username},ou=people,dc=corp"
  LDAP_SEARCH_BASE: z.string().optional(),
  LDAP_ATTR_DEPARTMENT: z.string().default("department"),
  LDAP_ATTR_OFFICE: z.string().default("physicalDeliveryOfficeName"),
  LDAP_ATTR_DISPLAY_NAME: z.string().default("displayName"),
  LDAP_ATTR_MAIL: z.string().default("mail"),

  // Dev login (never enable in production)
  DEV_LOGIN_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  // Escape hatch for disposable demo deployments without a reachable IdP
  // (ADR-0009): lets DEV_LOGIN_ENABLED work in production. Anyone who knows
  // a seeded email gets that user's session — never set this on real data.
  DEV_LOGIN_DANGEROUSLY_ALLOW_IN_PRODUCTION: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // Admin bootstrap: comma-separated emails granted is_admin at login
  ADMIN_EMAILS: z.string().default(""),

  // SMTP (notifications stay queued in the outbox until configured)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  SMTP_FROM: z.string().default("Sodalis <sodalis@example.internal>"),

  // Scheduler
  MATCH_CATCH_UP_HOURS: z.coerce.number().default(3),
  // Serverless deployments only (ADR-0009): /api/cron/tick accepts
  // `Authorization: Bearer <CRON_SECRET>` and stays disabled while unset.
  CRON_SECRET: z.string().optional(),
});

/** Exported for tests: parse a controlled input instead of process.env. */
export const envSchema = schema;

const DEV_FALLBACK_SECRET = "dev-secret-change-me";
const DEV_FALLBACK_DB = "postgres://sodalis:sodalis@localhost:5432/sodalis";

export type Env = Omit<
  z.infer<typeof schema>,
  "AUTH_SECRET" | "DATABASE_URL"
> & {
  AUTH_SECRET: string;
  DATABASE_URL: string;
};

const parsed = schema.parse(process.env);

// Production must not run on dev fallbacks: a guessable AUTH_SECRET lets
// anyone forge an admin session (JWT strategy), a defaulted DATABASE_URL
// points at nothing real, and dev-login bypasses SSO entirely. Enforced at
// runtime, not during `next build` (NEXT_PHASE) — build machines have no
// secrets and need none.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (parsed.NODE_ENV === "production" && !isBuildPhase) {
  if (
    !parsed.AUTH_SECRET ||
    parsed.AUTH_SECRET === DEV_FALLBACK_SECRET ||
    parsed.AUTH_SECRET.length < 16
  ) {
    throw new Error(
      "AUTH_SECRET must be set to a strong value in production — generate one with: openssl rand -base64 32",
    );
  }
  if (!parsed.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set explicitly in production");
  }
  if (parsed.DEV_LOGIN_ENABLED) {
    if (!parsed.DEV_LOGIN_DANGEROUSLY_ALLOW_IN_PRODUCTION) {
      // auth/index.ts also ignores the flag in production; this hard stop
      // makes the misconfiguration impossible to miss.
      throw new Error(
        "DEV_LOGIN_ENABLED must not be true in production (DEV_LOGIN_DANGEROUSLY_ALLOW_IN_PRODUCTION exists for disposable demo deployments only)",
      );
    }
    console.warn(
      "⚠️  DEV LOGIN IS ENABLED IN PRODUCTION — anyone who knows a seeded email can sign in as that user. Demo deployments only (ADR-0009).",
    );
  }
}

export const env: Env = {
  ...parsed,
  AUTH_SECRET: parsed.AUTH_SECRET ?? DEV_FALLBACK_SECRET,
  DATABASE_URL: parsed.DATABASE_URL ?? DEV_FALLBACK_DB,
};

export const adminEmails = new Set(
  env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
