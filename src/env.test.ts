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
});
