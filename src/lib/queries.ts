import { and, asc, between, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  activityTypes,
  cafeterias,
  cities,
  holidayCalendar,
  matchGroupMembers,
  matchGroups,
  matchPairs,
  matchRuns,
  offices,
  signups,
  users,
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

export type GroupMemberView = {
  userId: string;
  name: string;
  department: string | null;
  email: string;
  /** Shown when the member opted in or is the host. */
  contact: string | null;
  isHost: boolean;
};

export type GroupView = {
  groupId: string;
  hostUserId: string | null;
  venue: { nameEn: string; nameZh: string } | null;
  members: GroupMemberView[];
};

/** The user's group for a date, from the live (completed) run only. */
export async function getUserGroupForDate(
  userId: string,
  activityTypeId: string,
  date: LocalDate,
): Promise<GroupView | null> {
  const [row] = await db
    .select({
      groupId: matchGroups.id,
      hostUserId: matchGroups.hostUserId,
      cafeteriaId: matchGroups.cafeteriaId,
    })
    .from(matchGroupMembers)
    .innerJoin(matchGroups, eq(matchGroupMembers.groupId, matchGroups.id))
    .innerJoin(matchRuns, eq(matchGroups.matchRunId, matchRuns.id))
    .where(
      and(
        eq(matchGroupMembers.userId, userId),
        eq(matchGroups.activityTypeId, activityTypeId),
        eq(matchGroups.date, date),
        eq(matchRuns.status, "completed"),
      ),
    );
  if (!row) return null;

  const memberRows = await db
    .select({
      userId: users.id,
      name: users.name,
      department: users.department,
      email: users.email,
      contactExtra: users.contactExtra,
      contactVisible: users.contactVisible,
    })
    .from(matchGroupMembers)
    .innerJoin(users, eq(matchGroupMembers.userId, users.id))
    .where(eq(matchGroupMembers.groupId, row.groupId))
    .orderBy(asc(users.name));

  let venue: GroupView["venue"] = null;
  if (row.cafeteriaId) {
    const [caf] = await db
      .select({ nameEn: cafeterias.nameEn, nameZh: cafeterias.nameZh })
      .from(cafeterias)
      .where(eq(cafeterias.id, row.cafeteriaId));
    venue = caf ?? null;
  }

  return {
    groupId: row.groupId,
    hostUserId: row.hostUserId,
    venue,
    members: memberRows.map((m) => {
      const isHost = m.userId === row.hostUserId;
      return {
        userId: m.userId,
        name: m.name,
        department: m.department,
        email: m.email,
        contact: isHost || m.contactVisible ? m.contactExtra : null,
        isHost,
      };
    }),
  };
}

/** Has a completed run already produced results for this office/date? */
export async function hasCompletedRun(
  officeId: string,
  activityTypeId: string,
  date: LocalDate,
): Promise<boolean> {
  const [row] = await db
    .select({ id: matchRuns.id })
    .from(matchRuns)
    .where(
      and(
        eq(matchRuns.officeId, officeId),
        eq(matchRuns.activityTypeId, activityTypeId),
        eq(matchRuns.date, date),
        eq(matchRuns.status, "completed"),
      ),
    );
  return row !== undefined;
}

export type MetPerson = {
  userId: string;
  name: string;
  department: string | null;
  timesMet: number;
  lastDate: LocalDate;
};

/**
 * "People I've met", from match_pairs — which only ever holds live
 * (non-superseded) results, so history self-corrects after re-runs.
 */
export async function getMetHistory(userId: string): Promise<MetPerson[]> {
  const rows = await db
    .select({
      userLo: matchPairs.userLo,
      userHi: matchPairs.userHi,
      date: matchPairs.date,
    })
    .from(matchPairs)
    .where(or(eq(matchPairs.userLo, userId), eq(matchPairs.userHi, userId)))
    .orderBy(desc(matchPairs.date));

  const byPartner = new Map<string, { timesMet: number; lastDate: LocalDate }>();
  for (const row of rows) {
    const partner = row.userLo === userId ? row.userHi : row.userLo;
    const entry = byPartner.get(partner);
    if (entry) {
      entry.timesMet += 1;
      if (row.date > entry.lastDate) entry.lastDate = row.date;
    } else {
      byPartner.set(partner, { timesMet: 1, lastDate: row.date });
    }
  }
  if (byPartner.size === 0) return [];

  const people = await db
    .select({
      userId: users.id,
      name: users.name,
      department: users.department,
    })
    .from(users)
    .where(inArray(users.id, [...byPartner.keys()]));

  return people
    .map((p) => ({ ...p, ...byPartner.get(p.userId)! }))
    .sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));
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
