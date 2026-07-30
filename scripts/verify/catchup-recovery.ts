/**
 * Verifies: a manual re-run recovers a failed scheduler catch-up — it
 * materializes standing signups (rules unchanged since close) inside the
 * locked run transaction — and a second re-run does not duplicate rows.
 * Needs the dev database. Exits 0 on PASS, 1 on FAIL.
 *
 *   bun run scripts/verify/catchup-recovery.ts
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../src/db";
import {
  activityTypes,
  cities,
  matchGroupMembers,
  matchGroups,
  matchPairs,
  matchRuns,
  notifications,
  offices,
  signups,
  standingSignups,
  users,
} from "../../src/db/schema";
import { runMatch } from "../../src/lib/matching/run";
import { loadHolidayMap } from "../../src/lib/queries";
import { composeLocalTime } from "../../src/lib/time";

const DATE = "2026-08-10"; // a plain Monday

const [activity] = await db.select().from(activityTypes);
const [ctx] = await db
  .select({ officeId: offices.id, timezone: cities.timezone })
  .from(offices)
  .innerJoin(cities, eq(offices.cityId, cities.id))
  .where(eq(offices.nameZh, "望京办公区"));
const [standingUser] = await db
  .select({ id: users.id, email: users.email })
  .from(users)
  .innerJoin(standingSignups, eq(standingSignups.userId, users.id))
  .where(eq(users.officeId, ctx.officeId))
  .limit(1);
if (!standingUser) {
  console.error("FAIL: need a Wangjing user with a standing signup");
  process.exit(1);
}
// The rule must predate close (the cutoff excludes after-close edits).
await db.execute(
  sql`update standing_signups set updated_at = '2026-08-01 00:00:00+00' where user_id = ${standingUser.id}`,
);

async function cleanup() {
  const runs = await db
    .select({ id: matchRuns.id })
    .from(matchRuns)
    .where(and(eq(matchRuns.officeId, ctx.officeId), eq(matchRuns.date, DATE)));
  const runIds = runs.map((r) => r.id);
  if (runIds.length > 0) {
    const groups = await db
      .select({ id: matchGroups.id })
      .from(matchGroups)
      .where(inArray(matchGroups.matchRunId, runIds));
    const groupIds = groups.map((g) => g.id);
    await db.delete(matchPairs).where(inArray(matchPairs.matchRunId, runIds));
    if (groupIds.length > 0) {
      await db
        .delete(matchGroupMembers)
        .where(inArray(matchGroupMembers.groupId, groupIds));
    }
    await db.delete(matchGroups).where(inArray(matchGroups.matchRunId, runIds));
    for (const id of runIds) {
      await db
        .delete(notifications)
        .where(sql`${notifications.dedupeKey} like ${"match:" + id + ":%"}`);
    }
    await db.delete(matchRuns).where(inArray(matchRuns.id, runIds));
  }
  await db
    .delete(signups)
    .where(and(eq(signups.officeId, ctx.officeId), eq(signups.date, DATE)));
}

await cleanup();

// Simulate the aftermath of a FAILED scheduler catch-up: a failed run row,
// zero materialized signups (the failed transaction rolled them back).
await db.insert(matchRuns).values({
  officeId: ctx.officeId,
  activityTypeId: activity.id,
  date: DATE,
  seed: "verify-failed-catchup",
  status: "failed",
  triggeredBy: "scheduler",
  error: "simulated failure",
});

const closeAt = composeLocalTime(DATE, activity.signupCloseTime, ctx.timezone);
const holidays = await loadHolidayMap(DATE, DATE);
const catchUpMaterialize = { holidays, updatedBefore: closeAt };

const first = await runMatch({
  officeId: ctx.officeId,
  activityTypeId: activity.id,
  date: DATE,
  trigger: "manual",
  catchUpMaterialize,
});
const afterFirst = await db
  .select()
  .from(signups)
  .where(and(eq(signups.officeId, ctx.officeId), eq(signups.date, DATE)));

const second = await runMatch({
  officeId: ctx.officeId,
  activityTypeId: activity.id,
  date: DATE,
  trigger: "manual",
  catchUpMaterialize,
});
const afterSecond = await db
  .select()
  .from(signups)
  .where(and(eq(signups.officeId, ctx.officeId), eq(signups.date, DATE)));

const materialized = afterFirst.some(
  (s) => s.userId === standingUser.id && s.source === "standing",
);
const ok =
  first.outcome === "completed" &&
  second.outcome === "completed" &&
  materialized &&
  afterFirst.length === afterSecond.length;
console.log(
  `${ok ? "PASS" : "FAIL"}: first=${first.outcome} second=${second.outcome} standing-materialized=${materialized} rows ${afterFirst.length}→${afterSecond.length} (must be equal)`,
);
await cleanup();
process.exit(ok ? 0 : 1);
