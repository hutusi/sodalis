import { describe, expect, test } from "bun:test";

import {
  addDays,
  composeLocalTime,
  formatWallTime,
  isoWeekday,
  localDateFor,
} from "./time";

describe("time", () => {
  test("composeLocalTime maps Shanghai wall time to UTC-8h", () => {
    const instant = composeLocalTime("2026-07-30", "10:30", "Asia/Shanghai");
    expect(instant.toISOString()).toBe("2026-07-30T02:30:00.000Z");
  });

  test("composeLocalTime accepts pg time with seconds", () => {
    const instant = composeLocalTime("2026-07-30", "10:30:00", "Asia/Shanghai");
    expect(instant.toISOString()).toBe("2026-07-30T02:30:00.000Z");
  });

  test("localDateFor crosses the date line correctly", () => {
    // 2026-07-30T18:00Z is already July 31 in Shanghai? No: +8 → 02:00 July 31.
    const instant = new Date("2026-07-30T18:00:00Z");
    expect(localDateFor(instant, "Asia/Shanghai")).toBe("2026-07-31");
    expect(localDateFor(instant, "America/New_York")).toBe("2026-07-30");
  });

  test("localDateFor and composeLocalTime round-trip", () => {
    const instant = composeLocalTime("2026-01-01", "00:00", "Asia/Shanghai");
    expect(localDateFor(instant, "Asia/Shanghai")).toBe("2026-01-01");
    // One millisecond earlier is still New Year's Eve locally.
    expect(
      localDateFor(new Date(instant.getTime() - 1), "Asia/Shanghai"),
    ).toBe("2025-12-31");
  });

  test("isoWeekday: 2026-07-30 is Thursday, 2026-08-02 is Sunday", () => {
    expect(isoWeekday("2026-07-30")).toBe(4);
    expect(isoWeekday("2026-08-02")).toBe(7);
  });

  test("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("formatWallTime trims seconds", () => {
    expect(formatWallTime("10:30:00")).toBe("10:30");
    expect(formatWallTime("10:30")).toBe("10:30");
  });
});
