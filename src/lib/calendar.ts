import { addDays, isoWeekday, type LocalDate } from "./time";

export type DayKind = "holiday" | "workday";

/** date → kind, loaded from holiday_calendar for a date range. */
export type HolidayMap = ReadonlyMap<LocalDate, DayKind>;

/**
 * A calendar override wins outright; otherwise Mon–Fri.
 * kind='workday' marks 调休 makeup working days (usually weekends).
 */
export function isWorkingDay(date: LocalDate, holidays: HolidayMap): boolean {
  const kind = holidays.get(date);
  if (kind !== undefined) return kind === "workday";
  return isoWeekday(date) <= 5;
}

export function isMakeupWorkday(date: LocalDate, holidays: HolidayMap): boolean {
  return holidays.get(date) === "workday";
}

export function dayOffReason(
  date: LocalDate,
  holidays: HolidayMap,
): "holiday" | "weekend" | null {
  if (isWorkingDay(date, holidays)) return null;
  return holidays.get(date) === "holiday" ? "holiday" : "weekend";
}

/** The next `count` working days starting from `from` (inclusive). */
export function nextWorkingDays(
  from: LocalDate,
  count: number,
  holidays: HolidayMap,
): LocalDate[] {
  const days: LocalDate[] = [];
  let cursor = from;
  // 3× window is plenty even across Golden Week.
  for (let i = 0; i < count * 3 + 15 && days.length < count; i++) {
    if (isWorkingDay(cursor, holidays)) days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}
