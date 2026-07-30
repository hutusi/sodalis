"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/auth/session";
import { db } from "@/db";
import { activityTypes, signups } from "@/db/schema";
import { isWorkingDay } from "@/lib/calendar";
import { matchAdvisoryLock } from "@/lib/matching/lock";
import { getOfficeContext, loadHolidayMap } from "@/lib/queries";
import { composeLocalTime, localDateFor } from "@/lib/time";

// The regex alone accepts impossible dates like 2026-02-30, which JS Date
// would silently normalize into a different day (and a different close time).
const isRealDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

const signupInput = z.object({
  activityTypeId: z.uuid(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealDate, "invalid calendar date"),
  sizePref: z.enum(["pair_only", "flex_2_4"]).default("flex_2_4"),
  willingToHost: z.boolean().default(false),
});

async function loadSignup(userId: string, activityTypeId: string, date: string) {
  const [row] = await db
    .select()
    .from(signups)
    .where(
      and(
        eq(signups.userId, userId),
        eq(signups.activityTypeId, activityTypeId),
        eq(signups.date, date),
      ),
    );
  return row;
}

/**
 * All validation reads run on the global pool BEFORE any transaction is
 * opened — a transaction holding its pooled connection must never wait on
 * further pool checkouts, or concurrent signups can exhaust the pool while
 * queued behind the matcher's advisory lock. Returns the close instant so
 * the transaction can re-check the deadline with zero queries.
 */
async function validateSignupWindow(
  activityTypeId: string,
  date: string,
  officeId: string,
  opts: { requireWorkingDay: boolean },
): Promise<Date> {
  const octx = await getOfficeContext(officeId);
  if (!octx) throw new Error("office not found");
  const [activity] = await db
    .select()
    .from(activityTypes)
    .where(eq(activityTypes.id, activityTypeId));
  if (!activity || !activity.isActive) throw new Error("unknown activity");

  const now = new Date();
  const closeAt = composeLocalTime(date, activity.signupCloseTime, octx.timezone);
  if (now.getTime() >= closeAt.getTime()) throw new Error("signup closed");

  if (opts.requireWorkingDay) {
    const today = localDateFor(now, octx.timezone);
    const holidays = await loadHolidayMap(today, date);
    if (!isWorkingDay(date, holidays)) throw new Error("not a working day");
  }
  return closeAt;
}

export async function upsertSignup(formData: FormData) {
  const user = await requireUser();
  const input = signupInput.parse({
    activityTypeId: formData.get("activityTypeId"),
    date: formData.get("date"),
    sizePref: formData.get("sizePref") ?? undefined,
    willingToHost: formData.get("willingToHost") === "on",
  });

  const existing = await loadSignup(user.id, input.activityTypeId, input.date);
  // Edits keep the office snapshotted at signup time — moving offices in the
  // profile must not silently move a signup another office's matcher may be
  // reading. New signups (and rejoins after cancel, which are invisible to
  // matchers until this write) snapshot the user's current office.
  const targetOfficeId =
    existing?.status === "active" ? existing.officeId : user.officeId;
  if (!targetOfficeId) throw new Error("no office selected");

  const closeAt = await validateSignupWindow(
    input.activityTypeId,
    input.date,
    targetOfficeId,
    { requireWorkingDay: true },
  );

  await db.transaction(async (tx) => {
    await tx.execute(
      matchAdvisoryLock(targetOfficeId, input.activityTypeId, input.date),
    );
    // Zero queries between lock and write. If we blocked behind the matcher,
    // the wall clock is necessarily past close by the time we resume.
    if (Date.now() >= closeAt.getTime()) throw new Error("signup closed");

    await tx
      .insert(signups)
      .values({
        userId: user.id,
        activityTypeId: input.activityTypeId,
        officeId: targetOfficeId,
        date: input.date,
        groupSizePref: input.sizePref,
        willingToHost: input.willingToHost,
        source: "manual",
        status: "active",
      })
      .onConflictDoUpdate({
        target: [signups.userId, signups.activityTypeId, signups.date],
        set: {
          groupSizePref: input.sizePref,
          willingToHost: input.willingToHost,
          officeId: targetOfficeId,
          status: "active",
        },
      });
  });

  revalidatePath("/");
}

export async function cancelSignup(formData: FormData) {
  const user = await requireUser();
  const input = signupInput
    .pick({ activityTypeId: true, date: true })
    .parse({
      activityTypeId: formData.get("activityTypeId"),
      date: formData.get("date"),
    });

  const existing = await loadSignup(user.id, input.activityTypeId, input.date);
  if (!existing || existing.status === "cancelled") return;

  // Deadline is judged against the signup's own office (its timezone), not
  // the user's current one. No working-day requirement: an admin calendar
  // edit must never trap a user in a signup they want out of.
  const closeAt = await validateSignupWindow(
    input.activityTypeId,
    input.date,
    existing.officeId,
    { requireWorkingDay: false },
  );

  await db.transaction(async (tx) => {
    await tx.execute(
      matchAdvisoryLock(existing.officeId, input.activityTypeId, input.date),
    );
    if (Date.now() >= closeAt.getTime()) throw new Error("signup closed");

    // Kept as a 'cancelled' row (not deleted) so a standing signup cannot
    // silently re-materialize a day the user opted out of.
    await tx
      .update(signups)
      .set({ status: "cancelled" })
      .where(eq(signups.id, existing.id));
  });

  revalidatePath("/");
}
