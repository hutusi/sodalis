import { eq } from "drizzle-orm";

import { db } from "@/db";
import { signups } from "@/db/schema";
import { matchAdvisoryLock } from "./matching/lock";
import type { LocalDate } from "./time";

export type SignupWrite = {
  userId: string;
  activityTypeId: string;
  officeId: string;
  date: LocalDate;
  groupSizePref: "pair_only" | "flex_2_4";
  willingToHost: boolean;
};

/**
 * The lock-holding signup transactions, shared verbatim by the server
 * actions and scripts/verify/signup-contention.ts — CI exercises exactly
 * the production path, so a regression here (e.g. reintroducing a pool
 * query between lock and write) fails the contention check.
 *
 * Invariant: ZERO pool queries inside the transaction. All validation
 * happens before the call; `closeAt` is precomputed and only the wall
 * clock is re-checked after the advisory lock is acquired (if we blocked
 * behind a matcher, close has necessarily passed by the time we resume).
 */
export async function upsertSignupTx(
  input: SignupWrite,
  closeAt: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      matchAdvisoryLock(input.officeId, input.activityTypeId, input.date),
    );
    if (Date.now() >= closeAt.getTime()) throw new Error("signup closed");

    await tx
      .insert(signups)
      .values({ ...input, source: "manual", status: "active" })
      .onConflictDoUpdate({
        target: [signups.userId, signups.activityTypeId, signups.date],
        set: {
          groupSizePref: input.groupSizePref,
          willingToHost: input.willingToHost,
          officeId: input.officeId,
          status: "active",
        },
      });
  });
}

export async function cancelSignupTx(
  args: {
    signupId: string;
    officeId: string;
    activityTypeId: string;
    date: LocalDate;
  },
  closeAt: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      matchAdvisoryLock(args.officeId, args.activityTypeId, args.date),
    );
    if (Date.now() >= closeAt.getTime()) throw new Error("signup closed");

    // Kept as a 'cancelled' row (not deleted) so a standing signup cannot
    // silently re-materialize a day the user opted out of.
    await tx
      .update(signups)
      .set({ status: "cancelled" })
      .where(eq(signups.id, args.signupId));
  });
}
