import { TZDate } from "@date-fns/tz";

export type LocalDate = string; // "YYYY-MM-DD" in some office's local zone
export type WallTime = string; // "HH:MM" or "HH:MM:SS"

/** The local calendar date of `instant` in the given IANA zone. */
export function localDateFor(instant: Date, tz: string): LocalDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * Compose a local calendar date + wall-clock time in a zone into the UTC
 * instant it denotes. This is the only tz-sensitive operation in the app.
 */
export function composeLocalTime(
  date: LocalDate,
  time: WallTime,
  tz: string,
): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  const zoned = new TZDate(y, m - 1, d, hh, mm ?? 0, ss ?? 0, tz);
  return new Date(zoned.getTime());
}

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: LocalDate): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** date + n days, staying in pure calendar arithmetic. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "10:30:00" (pg time) → "10:30" for display. */
export function formatWallTime(time: WallTime): string {
  return time.slice(0, 5);
}
