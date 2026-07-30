import type { LocalDate } from "./time";

/** "2026-07-30" → "7月30日 周四" / "Thu, Jul 30" depending on locale. */
export function formatDateLabel(date: LocalDate, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    month: locale === "en" ? "short" : "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
