/**
 * Verifies: the PRODUCTION signup transactions (upsertSignupTx /
 * cancelSignupTx from src/lib/signup.ts — advisory lock → clock check →
 * write, zero pool queries inside) survive heavy contention behind a
 * matcher-style lock holder without exhausting the 10-connection pool.
 * Runs entirely on isolated fixtures; real dev data is never touched.
 * Exits 0 on PASS, 1 on FAIL.
 *
 *   bun run scripts/verify/signup-contention.ts
 */
import { and, eq } from "drizzle-orm";

import { db } from "../../src/db";
import { signups } from "../../src/db/schema";
import { matchAdvisoryLock } from "../../src/lib/matching/lock";
import { getPrimaryActivity } from "../../src/lib/queries";
import { cancelSignupTx, upsertSignupTx } from "../../src/lib/signup";
import { createFixtures } from "./fixtures";

const DATE = "2026-08-11";
const HOLD_MS = 2000;
const CONTENDERS = 12;

const activity = await getPrimaryActivity();
if (!activity) {
  console.error("FAIL: no active activity type (run: bun run seed)");
  process.exit(1);
}

const fx = await createFixtures(CONTENDERS);
let ok = false;
try {
  const t0 = Date.now();
  const holder = db.transaction(async (tx) => {
    await tx.execute(matchAdvisoryLock(fx.officeId, activity.id, DATE));
    await new Promise((r) => setTimeout(r, HOLD_MS));
  });
  await new Promise((r) => setTimeout(r, 100));
  // The far-future closeAt keeps the deadline check open; everything else
  // is exactly what the server action runs.
  const closeAt = new Date(Date.now() + 3_600_000);
  const writes = fx.userIds.map((userId) =>
    upsertSignupTx(
      {
        userId,
        activityTypeId: activity.id,
        officeId: fx.officeId,
        date: DATE,
        groupSizePref: "flex_2_4",
        willingToHost: false,
      },
      closeAt,
    ),
  );
  await Promise.all([holder, ...writes]);
  const elapsed = Date.now() - t0;

  const rows = await db
    .select()
    .from(signups)
    .where(and(eq(signups.officeId, fx.officeId), eq(signups.date, DATE)));

  // Exercise the production cancel path under the same lock scheme too.
  await cancelSignupTx(
    {
      signupId: rows[0].id,
      officeId: fx.officeId,
      activityTypeId: activity.id,
      date: DATE,
    },
    closeAt,
  );
  const [cancelledRow] = await db
    .select()
    .from(signups)
    .where(eq(signups.id, rows[0].id));

  // Generous ceiling: serialized lock handoffs, but nothing near a pool
  // timeout (postgres-js default connect_timeout is 30s per wait).
  ok =
    rows.length === CONTENDERS &&
    elapsed < 15_000 &&
    cancelledRow.status === "cancelled";
  console.log(
    `${ok ? "PASS" : "FAIL"}: ${CONTENDERS} contenders + 1 holder finished in ${elapsed}ms, rows=${rows.length}, cancel-path=${cancelledRow.status}`,
  );
} finally {
  await fx.cleanup();
}
process.exit(ok ? 0 : 1);
