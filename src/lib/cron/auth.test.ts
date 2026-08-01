import { describe, expect, test } from "bun:test";

import { isAuthorizedCron } from "./auth";

describe("isAuthorizedCron", () => {
  test("rejects when no secret is configured", () => {
    expect(isAuthorizedCron("Bearer s3cret", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer s3cret", "")).toBe(false);
  });

  test("rejects a missing or malformed header", () => {
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
    expect(isAuthorizedCron("s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedCron("Basic s3cret", "s3cret")).toBe(false);
  });

  test("rejects a wrong or truncated token", () => {
    expect(isAuthorizedCron("Bearer nope", "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer s3cre", "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer s3cret-longer", "s3cret")).toBe(false);
  });

  test("accepts the exact bearer token", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
  });
});
