/**
 * Import a holiday dataset JSON into holiday_calendar.
 *
 *   bun run holidays:import [path/to/holidays.json]
 *
 * Defaults to data/holidays-cn-2026.json. The whole payload is validated
 * first and imported in one transaction — a malformed row rejects the file
 * instead of leaving a half-applied calendar. Upserts by date, so re-running
 * with a corrected file overwrites earlier seed rows (admin edits use
 * source='admin' and are also overwritten — the file is the authority).
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

import { db } from "../src/db";
import { holidayCalendar } from "../src/db/schema";

const isRealDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

const holidayFile = z
  .object({
    year: z.number().int().min(2000).max(2200),
    source: z.string(),
    days: z
      .array(
        z.object({
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .refine(isRealDate, "invalid calendar date"),
          kind: z.enum(["holiday", "workday"]),
          label: z.string().trim().min(1),
        }),
      )
      .min(1),
  })
  .refine(
    (f) => new Set(f.days.map((d) => d.date)).size === f.days.length,
    "duplicate dates in dataset",
  );

export async function importHolidays(path: string) {
  const file = holidayFile.parse(JSON.parse(readFileSync(path, "utf-8")));
  await db.transaction(async (tx) => {
    for (const day of file.days) {
      await tx
        .insert(holidayCalendar)
        .values({
          date: day.date,
          kind: day.kind,
          label: day.label,
          source: "seed",
        })
        .onConflictDoUpdate({
          target: holidayCalendar.date,
          set: { kind: day.kind, label: day.label, source: "seed" },
        });
    }
  });
  return file.days.length;
}

if (import.meta.main) {
  const path = process.argv[2] ?? "data/holidays-cn-2026.json";
  const count = await importHolidays(path);
  console.log(`Imported ${count} calendar days from ${path}`);
  process.exit(0);
}
