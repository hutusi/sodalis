import { describe, expect, test } from "bun:test";

import { adminEmails, env, envSchema } from "./env";

describe("env", () => {
  test("parses with defaults", () => {
    expect(env.DATABASE_URL).toContain("postgres");
    expect(env.MATCH_CATCH_UP_HOURS).toBeGreaterThan(0);
  });

  test("adminEmails is a lowercased set", () => {
    for (const e of adminEmails) {
      expect(e).toBe(e.toLowerCase());
    }
  });

  test("serverless knobs default safely", () => {
    // Parse an empty input rather than asserting on `env`: the live values
    // legitimately vary with whatever .env the machine has.
    const parsed = envSchema.parse({});
    expect(parsed.DB_POOL_MAX).toBe(10);
    expect(parsed.DB_IDLE_TIMEOUT).toBe(20);
    expect(parsed.DEV_LOGIN_DANGEROUSLY_ALLOW_IN_PRODUCTION).toBe(false);
    expect(parsed.CRON_SECRET).toBeUndefined();
  });

  test("pool knobs reject values postgres-js would choke on", () => {
    expect(() => envSchema.parse({ DB_POOL_MAX: "1.5" })).toThrow();
    expect(() => envSchema.parse({ DB_POOL_MAX: "-1" })).toThrow();
    expect(() => envSchema.parse({ DB_POOL_MAX: "0" })).toThrow();
    expect(() => envSchema.parse({ DB_IDLE_TIMEOUT: "-5" })).toThrow();
    // 0 is meaningful for the idle timeout: postgres-js "keep connections open"
    expect(envSchema.parse({ DB_IDLE_TIMEOUT: "0" }).DB_IDLE_TIMEOUT).toBe(0);
  });
});
