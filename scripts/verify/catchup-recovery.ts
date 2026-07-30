/**
 * Verifies: a manual re-run recovers a failed scheduler catch-up — it
 * materializes standing signups (rules unchanged since close) inside the
 * locked run transaction — and a second re-run does not duplicate rows.
 * Runs entirely on isolated fixtures; real dev data is never touched.
 * Exits 0 on PASS, 1 on FAIL.
 *
 *   bun run scripts/verify/catchup-recovery.ts
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "../../src/db";
import { matchRuns, signups, standingSignups } from "../../src/db/schema";
import { runMatch } from "../../src/lib/matching/run";
import { getPrimaryActivity, loadHolidayMap } from "../../src/lib/queries";
import { composeLocalTime } from "../../src/lib/time";
import { createFixtures } from "./fixtures";

const DATE = "2026-08-10"; // a plain Monday

const activity = await getPrimaryActivity();
if (!activity) {
  console.error("FAIL: no active activity type (run: bun run seed)");
  process.exit(1);
}

const fx = await createFixtures(4);
let ok = false;
try {
  // Fixture-owned standing rule, backdated so it predates close (the
  // cutoff excludes after-close edits).
  const [rule] = await db
    .insert(standingSignups)
    .values({
      userId: fx.userIds[0],
      activityTypeId: activity.id,
      weekdays: [1, 2, 3, 4, 5],
      groupSizePref: "flex_2_4",
      willingToHost: true,
    })
    .returning({ id: standingSignups.id });
  await db.execute(
    sql`update standing_signups set updated_at = '2026-08-01 00:00:00+00' where id = ${rule.id}`,
  );

  // Aftermath of a FAILED scheduler catch-up: a failed run row, zero
  // materialized signups (the failed transaction rolled them back).
  await db.insert(matchRuns).values({
    officeId: fx.officeId,
    activityTypeId: activity.id,
    date: DATE,
    seed: "verify-failed-catchup",
    status: "failed",
    triggeredBy: "scheduler",
    error: "simulated failure",
  });

  const closeAt = composeLocalTime(DATE, activity.signupCloseTime, fx.timezone);
  const holidays = await loadHolidayMap(DATE, DATE);
  const catchUpMaterialize = { holidays, updatedBefore: closeAt };
  const base = {
    officeId: fx.officeId,
    activityTypeId: activity.id,
    date: DATE,
    trigger: "manual" as const,
    catchUpMaterialize,
  };

  const first = await runMatch(base);
  const afterFirst = await db
    .select()
    .from(signups)
    .where(and(eq(signups.officeId, fx.officeId), eq(signups.date, DATE)));
  const second = await runMatch(base);
  const afterSecond = await db
    .select()
    .from(signups)
    .where(and(eq(signups.officeId, fx.officeId), eq(signups.date, DATE)));

  const materialized = afterFirst.some(
    (s) => s.userId === fx.userIds[0] && s.source === "standing",
  );
  ok =
    first.outcome === "completed" &&
    second.outcome === "completed" &&
    materialized &&
    afterFirst.length === afterSecond.length;
  console.log(
    `${ok ? "PASS" : "FAIL"}: first=${first.outcome} second=${second.outcome} standing-materialized=${materialized} rows ${afterFirst.length}→${afterSecond.length} (must be equal)`,
  );
} finally {
  await fx.cleanup();
}
process.exit(ok ? 0 : 1);
