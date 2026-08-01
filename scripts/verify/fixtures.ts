/**
 * Isolated fixtures for the verify scripts: a dedicated INACTIVE city +
 * office (the scheduler tick filters on is_active, so a concurrently
 * running worker never touches them, while materializeStanding/runMatch
 * take explicit ids and work fully) plus throwaway users. cleanup()
 * removes exactly what was created — real dev data is never read, moved
 * or deleted.
 */
import { eq, inArray, like } from "drizzle-orm";

import { db } from "../../src/db";
import {
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

export type Fixtures = {
  /** First fixture office — convenience for single-office scripts. */
  officeId: string;
  officeIds: string[];
  timezone: string;
  userIds: string[];
  cleanup: () => Promise<void>;
};

export async function createFixtures(
  userCount: number,
  officeCount = 1,
): Promise<Fixtures> {
  const tag = `verify-${Date.now()}-${process.pid}`;
  const timezone = "Asia/Shanghai";

  const [city] = await db
    .insert(cities)
    .values({ nameEn: `${tag}-city`, nameZh: tag, timezone, isActive: false })
    .returning({ id: cities.id });
  const officeRows = await db
    .insert(offices)
    .values(
      Array.from({ length: officeCount }, (_, i) => ({
        cityId: city.id,
        nameEn: `${tag}-office-${i}`,
        nameZh: `${tag}-${i}`,
        isActive: false,
      })),
    )
    .returning({ id: offices.id });
  const officeIds = officeRows.map((o) => o.id);
  const userRows = await db
    .insert(users)
    .values(
      Array.from({ length: userCount }, (_, i) => ({
        email: `${tag}-${i}@verify.local`,
        name: `Verify ${i}`,
        department: `verify-dept-${i % 3}`,
        officeId: officeIds[0],
      })),
    )
    .returning({ id: users.id });
  const userIds = userRows.map((u) => u.id);

  async function cleanup() {
    const runs = await db
      .select({ id: matchRuns.id })
      .from(matchRuns)
      .where(inArray(matchRuns.officeId, officeIds));
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
      await db
        .delete(matchGroups)
        .where(inArray(matchGroups.matchRunId, runIds));
      for (const id of runIds) {
        await db
          .delete(notifications)
          .where(like(notifications.dedupeKey, `match:${id}:%`));
      }
    }
    if (userIds.length > 0) {
      await db
        .delete(notifications)
        .where(inArray(notifications.userId, userIds));
      await db.delete(signups).where(inArray(signups.userId, userIds));
      await db
        .delete(standingSignups)
        .where(inArray(standingSignups.userId, userIds));
    }
    if (runIds.length > 0) {
      await db.delete(matchRuns).where(inArray(matchRuns.id, runIds));
    }
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(offices).where(inArray(offices.id, officeIds));
    await db.delete(cities).where(eq(cities.id, city.id));
  }

  return { officeId: officeIds[0], officeIds, timezone, userIds, cleanup };
}
