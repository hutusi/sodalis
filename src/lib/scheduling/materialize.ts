import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { signups, standingSignups, users } from "@/db/schema";
import { isMakeupWorkday, type HolidayMap } from "../calendar";
import { isoWeekday, type LocalDate } from "../time";

const FULL_WEEK = [1, 2, 3, 4, 5];

/**
 * Does a standing signup apply on this date?
 * On a 调休 makeup workday (weekend date worked as a weekday), only
 * "every workday" standing signups (Mon–Fri all selected) apply — a
 * Tue/Thu-style selection tracks real weekdays, and auto-enrolling those
 * users on a substituted Saturday would surprise them.
 */
export function standingAppliesOn(
  weekdays: readonly number[],
  date: LocalDate,
  holidays: HolidayMap,
): boolean {
  if (isMakeupWorkday(date, holidays)) {
    return FULL_WEEK.every((d) => weekdays.includes(d));
  }
  return weekdays.includes(isoWeekday(date));
}

/**
 * Materialize applicable standing signups into concrete signup rows for
 * one office × activity × date. Runs every tick until close and is fully
 * idempotent: the (user, activity, date) unique key makes re-inserts
 * no-ops, and a user-cancelled row blocks resurrection outright.
 */
export async function materializeStanding(
  officeId: string,
  activityTypeId: string,
  date: LocalDate,
  holidays: HolidayMap,
): Promise<number> {
  const rows = await db
    .select({
      id: standingSignups.id,
      userId: standingSignups.userId,
      weekdays: standingSignups.weekdays,
      groupSizePref: standingSignups.groupSizePref,
      willingToHost: standingSignups.willingToHost,
    })
    .from(standingSignups)
    .innerJoin(users, eq(standingSignups.userId, users.id))
    .where(
      and(
        eq(users.officeId, officeId),
        eq(standingSignups.activityTypeId, activityTypeId),
        eq(standingSignups.isPaused, false),
      ),
    );

  const applicable = rows.filter((r) =>
    standingAppliesOn(r.weekdays, date, holidays),
  );
  if (applicable.length === 0) return 0;

  const inserted = await db
    .insert(signups)
    .values(
      applicable.map((r) => ({
        userId: r.userId,
        activityTypeId,
        officeId,
        date,
        groupSizePref: r.groupSizePref,
        willingToHost: r.willingToHost,
        source: "standing" as const,
        standingSignupId: r.id,
        status: "active" as const,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: signups.id });
  return inserted.length;
}
