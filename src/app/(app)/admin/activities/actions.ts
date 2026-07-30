"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin } from "@/auth/session";
import { db } from "@/db";
import { activityTypes } from "@/db/schema";

const timeField = z.string().regex(/^\d{2}:\d{2}$/);

const activityInput = z.object({
  nameEn: z.string().trim().min(1).max(100),
  nameZh: z.string().trim().min(1).max(100),
  signupCloseTime: timeField,
  notifyByTime: timeField,
  eventTime: timeField,
});

export async function updateActivity(formData: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(formData.get("id"));
  const input = activityInput.parse({
    nameEn: formData.get("nameEn"),
    nameZh: formData.get("nameZh"),
    signupCloseTime: formData.get("signupCloseTime"),
    notifyByTime: formData.get("notifyByTime"),
    eventTime: formData.get("eventTime"),
  });
  await db
    .update(activityTypes)
    .set({ ...input, isActive: formData.get("isActive") === "on" })
    .where(eq(activityTypes.id, id));
  revalidatePath("/admin/activities");
}

export async function addActivity(formData: FormData) {
  await requireAdmin();
  const key = z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .parse(formData.get("key"));
  const input = activityInput.parse({
    nameEn: formData.get("nameEn"),
    nameZh: formData.get("nameZh"),
    signupCloseTime: formData.get("signupCloseTime"),
    notifyByTime: formData.get("notifyByTime"),
    eventTime: formData.get("eventTime"),
  });
  await db.insert(activityTypes).values({ key, ...input });
  revalidatePath("/admin/activities");
}
