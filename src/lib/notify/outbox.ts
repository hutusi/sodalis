import { and, asc, eq, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { emailNotifier, notifiers } from "./email";
import type { NotificationPayload } from "./types";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
/** A 'sending' row older than this is a crash leftover — reclaim it. */
const STUCK_SENDING_MS = 10 * 60_000;

let warnedUnconfigured = false;

/**
 * One outbox pass: claim due rows (FOR UPDATE SKIP LOCKED, so a second
 * dispatcher can never double-send), then deliver outside the claim
 * transaction. Failures back off exponentially (2^attempts minutes) and
 * give up into 'failed' after MAX_ATTEMPTS — visible in the admin runs
 * view rather than silently dropped.
 */
export async function dispatchOutbox(now: Date = new Date()): Promise<number> {
  if (!emailNotifier.isConfigured()) {
    if (!warnedUnconfigured) {
      console.warn("[outbox] SMTP_HOST not set — notifications stay queued");
      warnedUnconfigured = true;
    }
    return 0;
  }

  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({
        id: notifications.id,
        channel: notifications.channel,
        locale: notifications.locale,
        payload: notifications.payload,
        attempts: notifications.attempts,
        email: users.email,
      })
      .from(notifications)
      .innerJoin(users, eq(notifications.userId, users.id))
      .where(
        or(
          and(
            eq(notifications.status, "pending"),
            lte(notifications.nextAttemptAt, now),
          ),
          and(
            eq(notifications.status, "sending"),
            lt(
              notifications.updatedAt,
              new Date(now.getTime() - STUCK_SENDING_MS),
            ),
          ),
        ),
      )
      .orderBy(asc(notifications.nextAttemptAt))
      .limit(BATCH_SIZE)
      .for("update", { of: notifications, skipLocked: true });

    if (due.length > 0) {
      await tx
        .update(notifications)
        .set({
          status: "sending",
          attempts: sql`${notifications.attempts} + 1`,
        })
        .where(
          or(...due.map((row) => eq(notifications.id, row.id))),
        );
    }
    return due;
  });

  let sent = 0;
  for (const row of claimed) {
    const notifier = notifiers[row.channel];
    const attempt = row.attempts + 1;
    // Every transition below is compare-and-set on status='sending': a run
    // superseded mid-flight marks the row 'cancelled', and neither the
    // success nor the failure path may resurrect it (a cancelled row must
    // never be retried, and crash-reclaim only ever selects 'sending').
    try {
      await notifier.send({
        to: row.email,
        locale: row.locale,
        payload: row.payload as NotificationPayload,
      });
      await db
        .update(notifications)
        .set({ status: "sent", sentAt: new Date() })
        .where(
          and(
            eq(notifications.id, row.id),
            eq(notifications.status, "sending"),
          ),
        );
      sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = attempt >= MAX_ATTEMPTS;
      await db
        .update(notifications)
        .set({
          status: exhausted ? "failed" : "pending",
          lastError: message,
          nextAttemptAt: new Date(now.getTime() + 2 ** attempt * 60_000),
        })
        .where(
          and(
            eq(notifications.id, row.id),
            eq(notifications.status, "sending"),
          ),
        );
      console.error(
        `[outbox] send failed (attempt ${attempt}${exhausted ? ", giving up" : ""}): ${message}`,
      );
    }
  }
  return sent;
}
