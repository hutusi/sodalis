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

  DATABASE_URL: z
    .string()
    .default("postgres://sodalis:sodalis@localhost:5432/sodalis"),

  // Auth.js
  AUTH_SECRET: z.string().default("dev-secret-change-me"),
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
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);

export const adminEmails = new Set(
  env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
