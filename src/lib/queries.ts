import { and, asc, between, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  activityTypes,
  cities,
  holidayCalendar,
  offices,
  signups,
} from "@/db/schema";
import type { DayKind, HolidayMap } from "./calendar";
import type { LocalDate } from "./time";

export async function loadHolidayMap(
  from: LocalDate,
  to: LocalDate,
): Promise<HolidayMap> {
  const rows = await db
    .select({ date: holidayCalendar.date, kind: holidayCalendar.kind })
    .from(holidayCalendar)
    .where(between(holidayCalendar.date, from, to));
  return new Map<LocalDate, DayKind>(rows.map((r) => [r.date, r.kind]));
}

export async function getActiveActivities() {
  return db
    .select()
    .from(activityTypes)
    .where(eq(activityTypes.isActive, true))
    .orderBy(asc(activityTypes.key));
}

/** "lunch" if present, otherwise the first active activity. */
export async function getPrimaryActivity() {
  const active = await getActiveActivities();
  return active.find((a) => a.key === "lunch") ?? active[0] ?? null;
}

export type OfficeContext = {
  officeId: string;
  officeNameEn: string;
  officeNameZh: string;
  cityId: string;
  timezone: string;
};

export async function getOfficeContext(
  officeId: string,
): Promise<OfficeContext | null> {
  const [row] = await db
    .select({
      officeId: offices.id,
      officeNameEn: offices.nameEn,
      officeNameZh: offices.nameZh,
      cityId: cities.id,
      timezone: cities.timezone,
    })
    .from(offices)
    .innerJoin(cities, eq(offices.cityId, cities.id))
    .where(eq(offices.id, officeId));
  return row ?? null;
}

export async function getUserSignups(
  userId: string,
  activityTypeId: string,
  dates: LocalDate[],
) {
  if (dates.length === 0) return [];
  return db
    .select()
    .from(signups)
    .where(
      and(
        eq(signups.userId, userId),
        eq(signups.activityTypeId, activityTypeId),
        inArray(signups.date, dates),
      ),
    );
}

export async function listOfficesWithCity() {
  return db
    .select({
      id: offices.id,
      nameEn: offices.nameEn,
      nameZh: offices.nameZh,
      cityNameEn: cities.nameEn,
      cityNameZh: cities.nameZh,
    })
    .from(offices)
    .innerJoin(cities, eq(offices.cityId, cities.id))
    .where(eq(offices.isActive, true))
    .orderBy(asc(cities.nameEn), asc(offices.nameEn));
}
