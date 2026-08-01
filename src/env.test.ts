import { describe, expect, test } from "bun:test";

import { adminEmails, env } from "./env";

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
    expect(env.DB_POOL_MAX).toBe(10);
    expect(env.DB_IDLE_TIMEOUT).toBe(20);
    expect(env.DEV_LOGIN_DANGEROUSLY_ALLOW_IN_PRODUCTION).toBe(false);
    expect(env.CRON_SECRET).toBeUndefined();
  });
});
