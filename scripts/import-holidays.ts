/**
 * Import a holiday dataset JSON into holiday_calendar.
 *
 *   bun run holidays:import [path/to/holidays.json]
 *
 * Defaults to data/holidays-cn-2026.json. Upserts by date, so re-running
 * with a corrected file overwrites earlier seed rows (admin edits use
 * source='admin' and are also overwritten — the file is the authority).
 */
import { readFileSync } from "node:fs";

import { db } from "../src/db";
import { holidayCalendar } from "../src/db/schema";

type HolidayFile = {
  year: number;
  source: string;
  days: Array<{ date: string; kind: "holiday" | "workday"; label: string }>;
};

export async function importHolidays(path: string) {
  const file = JSON.parse(readFileSync(path, "utf-8")) as HolidayFile;
  for (const day of file.days) {
    await db
      .insert(holidayCalendar)
      .values({ date: day.date, kind: day.kind, label: day.label, source: "seed" })
      .onConflictDoUpdate({
        target: holidayCalendar.date,
        set: { kind: day.kind, label: day.label, source: "seed" },
      });
  }
  return file.days.length;
}

if (import.meta.main) {
  const path = process.argv[2] ?? "data/holidays-cn-2026.json";
  const count = await importHolidays(path);
  console.log(`Imported ${count} calendar days from ${path}`);
  process.exit(0);
}
