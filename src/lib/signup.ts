import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { signups } from "@/db/schema";
import { matchAdvisoryLock } from "./matching/lock";
import type { LocalDate } from "./time";

/**
 * Thrown when the row no longer matches the state the caller validated
 * against (e.g. a concurrent tab cancelled/rejoined at another office).
 * Safe to surface to the user as "please retry" — a fresh page load
 * re-reads current state.
 */
export const SIGNUP_CONFLICT = "signup conflict — please retry";

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
 * Invariants: ZERO pool queries inside the transaction (all validation
 * happens before the call; `closeAt` is precomputed and only the wall
 * clock is re-checked after the advisory lock is acquired), and writes
 * are compare-and-set against the pre-validated state — we hold the lock
 * for `input.officeId` only, so a stale request must never mutate a row
 * that meanwhile moved to another office (whose matcher we did NOT lock
 * out). The conflict-update applies only when the existing row is still
 * at the target office (a prefs edit, or the benign race with the
 * standing-materializer) or is cancelled (a rejoin, which re-snapshots
 * the office); anything else means our pre-read went stale → retryable
 * error, never a silent cross-office move.
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

    const written = await tx
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
        setWhere: sql`${signups.officeId} = ${input.officeId} or ${signups.status} = 'cancelled'`,
      })
      .returning({ id: signups.id });
    if (written.length === 0) throw new Error(SIGNUP_CONFLICT);
  });
}

export async function cancelSignupTx(
  args: {
    signupId: string;
    /** The office the caller validated against — we hold only its lock. */
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
    // silently re-materialize a day the user opted out of. The office
    // predicate is the compare-and-set: a row that moved to another office
    // since our pre-read must not be cancelled under this office's lock.
    // (Cancelling an already-cancelled row here is an idempotent no-op.)
    const written = await tx
      .update(signups)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(signups.id, args.signupId),
          eq(signups.officeId, args.officeId),
        ),
      )
      .returning({ id: signups.id });
    if (written.length === 0) throw new Error(SIGNUP_CONFLICT);
  });
}
