"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/auth/session";
import { db } from "@/db";
import { signups, standingSignups } from "@/db/schema";

const standingInput = z.object({
  activityTypeId: z.uuid(),
  weekdays: z.array(z.coerce.number().int().min(1).max(5)).min(1),
  sizePref: z.enum(["pair_only", "flex_2_4"]).default("flex_2_4"),
  willingToHost: z.boolean().default(false),
});

export async function saveStanding(formData: FormData) {
  const user = await requireUser();
  const input = standingInput.parse({
    activityTypeId: formData.get("activityTypeId"),
    weekdays: formData.getAll("weekdays"),
    sizePref: formData.get("sizePref") ?? undefined,
    willingToHost: formData.get("willingToHost") === "on",
  });

  await db
    .insert(standingSignups)
    .values({
      userId: user.id,
      activityTypeId: input.activityTypeId,
      weekdays: input.weekdays,
      groupSizePref: input.sizePref,
      willingToHost: input.willingToHost,
      isPaused: false,
    })
    .onConflictDoUpdate({
      target: [standingSignups.userId, standingSignups.activityTypeId],
      set: {
        weekdays: input.weekdays,
        groupSizePref: input.sizePref,
        willingToHost: input.willingToHost,
        isPaused: false,
      },
    });

  revalidatePath("/standing");
}

/**
 * Materialized-but-unmatched signups from this standing rule are cancelled
 * alongside a pause/remove. The cutoff is UTC-today, which east of UTC can
 * include the local today — harmless, since cancelling a row after its
 * match ran has no retroactive effect, and a pausing user wants out anyway.
 */
async function cancelFutureMaterialized(standingId: string, userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  await db
    .update(signups)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(signups.standingSignupId, standingId),
        eq(signups.userId, userId),
        eq(signups.status, "active"),
        gt(signups.date, today),
      ),
    );
}

const idInput = z.object({ id: z.uuid() });

export async function pauseStanding(formData: FormData) {
  const user = await requireUser();
  const { id } = idInput.parse({ id: formData.get("id") });
  const [row] = await db
    .update(standingSignups)
    .set({ isPaused: true })
    .where(and(eq(standingSignups.id, id), eq(standingSignups.userId, user.id)))
    .returning();
  if (row) await cancelFutureMaterialized(row.id, user.id);
  revalidatePath("/standing");
}

export async function resumeStanding(formData: FormData) {
  const user = await requireUser();
  const { id } = idInput.parse({ id: formData.get("id") });
  await db
    .update(standingSignups)
    .set({ isPaused: false })
    .where(and(eq(standingSignups.id, id), eq(standingSignups.userId, user.id)));
  revalidatePath("/standing");
}

export async function removeStanding(formData: FormData) {
  const user = await requireUser();
  const { id } = idInput.parse({ id: formData.get("id") });
  await cancelFutureMaterialized(id, user.id);
  await db
    .delete(standingSignups)
    .where(and(eq(standingSignups.id, id), eq(standingSignups.userId, user.id)));
  revalidatePath("/standing");
}
