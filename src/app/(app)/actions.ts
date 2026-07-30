"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/auth/session";
import { db } from "@/db";
import { activityTypes, signups } from "@/db/schema";
import { isWorkingDay } from "@/lib/calendar";
import { matchAdvisoryLock } from "@/lib/matching/lock";
import {
  getOfficeContext,
  loadHolidayMap,
} from "@/lib/queries";
import { composeLocalTime, localDateFor } from "@/lib/time";

const signupInput = z.object({
  activityTypeId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sizePref: z.enum(["pair_only", "flex_2_4"]).default("flex_2_4"),
  willingToHost: z.boolean().default(false),
});

/**
 * A signup for `date` is editable while the office-local clock is before
 * that date's close time — future dates trivially qualify, past dates never.
 */
async function assertEditable(activityTypeId: string, date: string, officeId: string) {
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

  const today = localDateFor(now, octx.timezone);
  const holidays = await loadHolidayMap(today, date);
  if (!isWorkingDay(date, holidays)) throw new Error("not a working day");
}

export async function upsertSignup(formData: FormData) {
  const user = await requireUser();
  if (!user.officeId) throw new Error("no office selected");

  const input = signupInput.parse({
    activityTypeId: formData.get("activityTypeId"),
    date: formData.get("date"),
    sizePref: formData.get("sizePref") ?? undefined,
    willingToHost: formData.get("willingToHost") === "on",
  });
  const officeId = user.officeId;

  // Same advisory lock runMatch holds for its whole transaction: a signup
  // racing the matcher blocks here until the run commits, and the deadline
  // re-check below (wall clock, evaluated after the lock) then rejects it
  // instead of committing an active-but-never-matched row.
  await db.transaction(async (tx) => {
    await tx.execute(matchAdvisoryLock(officeId, input.activityTypeId, input.date));
    await assertEditable(input.activityTypeId, input.date, officeId);

    await tx
      .insert(signups)
      .values({
        userId: user.id,
        activityTypeId: input.activityTypeId,
        officeId,
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
          officeId,
          status: "active",
        },
      });
  });

  revalidatePath("/");
}

export async function cancelSignup(formData: FormData) {
  const user = await requireUser();
  if (!user.officeId) throw new Error("no office selected");

  const input = signupInput
    .pick({ activityTypeId: true, date: true })
    .parse({
      activityTypeId: formData.get("activityTypeId"),
      date: formData.get("date"),
    });
  const officeId = user.officeId;

  await db.transaction(async (tx) => {
    await tx.execute(matchAdvisoryLock(officeId, input.activityTypeId, input.date));
    await assertEditable(input.activityTypeId, input.date, officeId);

    // Kept as a 'cancelled' row (not deleted) so a standing signup cannot
    // silently re-materialize a day the user opted out of.
    await tx
      .update(signups)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(signups.userId, user.id),
          eq(signups.activityTypeId, input.activityTypeId),
          eq(signups.date, input.date),
        ),
      );
  });

  revalidatePath("/");
}
