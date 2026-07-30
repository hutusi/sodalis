import { and, count, eq, lt } from "drizzle-orm";

import { db } from "@/db";
import { cities, notifications, offices } from "@/db/schema";
import { env } from "@/env";
import { isWorkingDay } from "../calendar";
import { runMatch } from "../matching/run";
import { getActiveActivities, loadHolidayMap } from "../queries";
import { composeLocalTime, localDateFor } from "../time";
import { materializeStanding } from "./materialize";

/** Pending notifications older than this trigger the delivery-lag warning. */
const SLA_LAG_MS = 15 * 60_000;

/**
 * One scheduler pass, safe to run every 30 seconds. All work is derived
 * from the DB at tick time — admin edits to offices or activity times take
 * effect on the next tick, and idempotency lives in the DB (unique keys),
 * not in scheduler memory:
 *
 *  before close            → materialize standing signups (idempotent)
 *  close … close + window  → trigger matching; the run materializes any
 *                            missed standing signups inside its own locked
 *                            transaction (downtime catch-up), restricted to
 *                            rules unchanged since close, and no-ops when a
 *                            live run already exists
 */
export async function schedulerTick(now: Date = new Date()): Promise<void> {
  const officeRows = await db
    .select({
      officeId: offices.id,
      officeName: offices.nameEn,
      timezone: cities.timezone,
    })
    .from(offices)
    .innerJoin(cities, eq(offices.cityId, cities.id))
    .where(and(eq(offices.isActive, true), eq(cities.isActive, true)));
  const activities = await getActiveActivities();
  if (officeRows.length === 0 || activities.length === 0) return;

  const localDates = officeRows.map((o) => localDateFor(now, o.timezone));
  const holidays = await loadHolidayMap(
    localDates.reduce((a, b) => (a < b ? a : b)),
    localDates.reduce((a, b) => (a > b ? a : b)),
  );
  const catchUpMs = env.MATCH_CATCH_UP_HOURS * 3_600_000;

  for (const office of officeRows) {
    const localDate = localDateFor(now, office.timezone);
    if (!isWorkingDay(localDate, holidays)) continue;

    for (const activity of activities) {
      const closeAt = composeLocalTime(
        localDate,
        activity.signupCloseTime,
        office.timezone,
      );

      if (now.getTime() < closeAt.getTime()) {
        const created = await materializeStanding(
          db,
          office.officeId,
          activity.id,
          localDate,
          holidays,
        );
        if (created > 0) {
          console.log(
            `[tick] materialized ${created} standing signup(s) for ${office.officeName} ${activity.key} ${localDate}`,
          );
        }
      } else if (now.getTime() <= closeAt.getTime() + catchUpMs) {
        const result = await runMatch({
          officeId: office.officeId,
          activityTypeId: activity.id,
          date: localDate,
          trigger: "scheduler",
          catchUpMaterialize: { holidays, updatedBefore: closeAt },
        });
        if (result.outcome === "completed") {
          console.log(
            `[tick] matched ${office.officeName} ${activity.key} ${localDate} → run ${result.runId}`,
          );
        } else if (result.outcome === "failed") {
          console.error(
            `[tick] match FAILED for ${office.officeName} ${activity.key} ${localDate}: ${result.error}`,
          );
        }
      }
    }
  }

  // Delivery-lag warning, once per tick (not per office×activity): pending
  // rows that have sat longer than the SLA lag mean SMTP is down or slow.
  const [{ value: lagging }] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.status, "pending"),
        lt(notifications.createdAt, new Date(now.getTime() - SLA_LAG_MS)),
      ),
    );
  if (lagging > 0) {
    console.warn(
      `[tick] SLA: ${lagging} notification(s) pending for more than ${SLA_LAG_MS / 60_000} minutes`,
    );
  }
}
