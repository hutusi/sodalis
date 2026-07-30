/**
 * Verifies: signup-style transactions (advisory lock → clock check → write,
 * zero pool queries inside) survive heavy contention behind a matcher-style
 * lock holder without exhausting the 10-connection pool.
 * Needs the dev database. Exits 0 on PASS, 1 on FAIL.
 *
 *   bun run scripts/verify/signup-contention.ts
 */
import { and, eq } from "drizzle-orm";

import { db } from "../../src/db";
import { activityTypes, offices, signups, users } from "../../src/db/schema";
import { matchAdvisoryLock } from "../../src/lib/matching/lock";

const DATE = "2026-08-11";
const HOLD_MS = 2000;

const [activity] = await db.select().from(activityTypes);
const [office] = await db.select().from(offices).where(eq(offices.nameZh, "望京办公区"));
const contenders = await db
  .select()
  .from(users)
  .where(eq(users.officeId, office.id))
  .limit(12);

const t0 = Date.now();
const holder = db.transaction(async (tx) => {
  await tx.execute(matchAdvisoryLock(office.id, activity.id, DATE));
  await new Promise((r) => setTimeout(r, HOLD_MS));
});
await new Promise((r) => setTimeout(r, 100));
const writes = contenders.map((u) =>
  db.transaction(async (tx) => {
    await tx.execute(matchAdvisoryLock(office.id, activity.id, DATE));
    await tx
      .insert(signups)
      .values({
        userId: u.id,
        activityTypeId: activity.id,
        officeId: office.id,
        date: DATE,
        groupSizePref: "flex_2_4",
        willingToHost: false,
        source: "manual",
        status: "active",
      })
      .onConflictDoNothing();
  }),
);
await Promise.all([holder, ...writes]);
const elapsed = Date.now() - t0;

const rows = await db
  .select()
  .from(signups)
  .where(and(eq(signups.officeId, office.id), eq(signups.date, DATE)));
await db.delete(signups).where(and(eq(signups.officeId, office.id), eq(signups.date, DATE)));

// Generous ceiling: serialized lock handoffs, but nothing near a pool
// timeout (postgres-js default connect_timeout is 30s per wait).
const ok = rows.length === contenders.length && elapsed < 15_000;
console.log(
  `${ok ? "PASS" : "FAIL"}: ${contenders.length} contenders + 1 holder finished in ${elapsed}ms, rows=${rows.length}`,
);
process.exit(ok ? 0 : 1);
