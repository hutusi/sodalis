import { describe, expect, test } from "bun:test";

import {
  dayOffReason,
  isMakeupWorkday,
  isWorkingDay,
  nextWorkingDays,
  type DayKind,
} from "./calendar";

// Mirrors the real 2026 CN calendar around National Day:
// Oct 1–7 holiday, Sep 20 (Sun) + Oct 10 (Sat) makeup workdays.
const holidays = new Map<string, DayKind>([
  ["2026-09-20", "workday"],
  ["2026-09-25", "holiday"],
  ["2026-09-26", "holiday"],
  ["2026-09-27", "holiday"],
  ["2026-10-01", "holiday"],
  ["2026-10-02", "holiday"],
  ["2026-10-03", "holiday"],
  ["2026-10-04", "holiday"],
  ["2026-10-05", "holiday"],
  ["2026-10-06", "holiday"],
  ["2026-10-07", "holiday"],
  ["2026-10-10", "workday"],
]);

describe("calendar", () => {
  test("plain weekday is a working day", () => {
    expect(isWorkingDay("2026-07-30", holidays)).toBe(true); // Thursday
  });

  test("plain weekend is not", () => {
    expect(isWorkingDay("2026-08-01", holidays)).toBe(false); // Saturday
  });

  test("holiday on a weekday is not a working day", () => {
    expect(isWorkingDay("2026-10-01", holidays)).toBe(false); // Thursday
  });

  test("调休 Saturday/Sunday IS a working day", () => {
    expect(isWorkingDay("2026-10-10", holidays)).toBe(true); // Saturday
    expect(isWorkingDay("2026-09-20", holidays)).toBe(true); // Sunday
    expect(isMakeupWorkday("2026-10-10", holidays)).toBe(true);
    expect(isMakeupWorkday("2026-10-09", holidays)).toBe(false);
  });

  test("dayOffReason distinguishes holiday from weekend", () => {
    expect(dayOffReason("2026-10-01", holidays)).toBe("holiday");
    expect(dayOffReason("2026-08-01", holidays)).toBe("weekend");
    expect(dayOffReason("2026-07-30", holidays)).toBeNull();
  });

  test("nextWorkingDays skips Golden Week and includes makeup Saturday", () => {
    // Sep 28 (Mon) → Sep 28, 29, 30, then Oct 1–7 holiday, Oct 8 (Thu),
    // Oct 9 (Fri), Oct 10 makeup Saturday.
    const days = nextWorkingDays("2026-09-28", 6, holidays);
    expect(days).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
    ]);
  });
});
