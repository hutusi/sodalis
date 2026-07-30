"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin } from "@/auth/session";
import { db } from "@/db";
import { holidayCalendar } from "@/db/schema";

export async function addCalendarDay(formData: FormData) {
  await requireAdmin();
  const input = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      kind: z.enum(["holiday", "workday"]),
      label: z.string().trim().min(1).max(100),
    })
    .parse({
      date: formData.get("date"),
      kind: formData.get("kind"),
      label: formData.get("label"),
    });
  await db
    .insert(holidayCalendar)
    .values({ ...input, source: "admin" })
    .onConflictDoUpdate({
      target: holidayCalendar.date,
      set: { kind: input.kind, label: input.label, source: "admin" },
    });
  revalidatePath("/admin/holidays");
}

export async function deleteCalendarDay(formData: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(formData.get("id"));
  await db.delete(holidayCalendar).where(eq(holidayCalendar.id, id));
  revalidatePath("/admin/holidays");
}
