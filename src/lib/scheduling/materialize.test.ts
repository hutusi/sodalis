import { describe, expect, test } from "bun:test";

import type { DayKind } from "../calendar";
import { standingAppliesOn } from "./materialize";

// 2026-10-10 is the real 国庆 makeup Saturday; 2026-09-20 the makeup Sunday.
const holidays = new Map<string, DayKind>([
  ["2026-09-20", "workday"],
  ["2026-10-01", "holiday"],
  ["2026-10-10", "workday"],
]);

const TUE_THU = [2, 4];
const ALL_WEEK = [1, 2, 3, 4, 5];

describe("standingAppliesOn", () => {
  test("applies on a selected plain weekday", () => {
    expect(standingAppliesOn(TUE_THU, "2026-07-28", holidays)).toBe(true); // Tue
    expect(standingAppliesOn(TUE_THU, "2026-07-30", holidays)).toBe(true); // Thu
  });

  test("does not apply on an unselected weekday", () => {
    expect(standingAppliesOn(TUE_THU, "2026-07-29", holidays)).toBe(false); // Wed
  });

  test("sparse selection does NOT apply on a 调休 makeup Saturday", () => {
    expect(standingAppliesOn(TUE_THU, "2026-10-10", holidays)).toBe(false);
  });

  test("every-workday selection DOES apply on a 调休 makeup day", () => {
    expect(standingAppliesOn(ALL_WEEK, "2026-10-10", holidays)).toBe(true);
    expect(standingAppliesOn(ALL_WEEK, "2026-09-20", holidays)).toBe(true);
  });

  test("selection is weekday-driven on holidays (the tick filters those)", () => {
    // 2026-10-01 is a Thursday holiday: appliesOn is true for Thu selections,
    // but schedulerTick never materializes because isWorkingDay is false.
    expect(standingAppliesOn(TUE_THU, "2026-10-01", holidays)).toBe(true);
  });
});
