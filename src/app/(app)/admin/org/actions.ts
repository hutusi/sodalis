"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin } from "@/auth/session";
import { db } from "@/db";
import { cafeterias, cities, offices } from "@/db/schema";

const names = {
  nameEn: z.string().trim().min(1).max(100),
  nameZh: z.string().trim().min(1).max(100),
};

function refresh() {
  revalidatePath("/admin/org");
}

export async function addCity(formData: FormData) {
  await requireAdmin();
  const input = z
    .object({ ...names, timezone: z.string().trim().min(1) })
    .parse({
      nameEn: formData.get("nameEn"),
      nameZh: formData.get("nameZh"),
      timezone: formData.get("timezone"),
    });
  // Reject bad IANA names early — a typo here would silently break scheduling.
  new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  await db.insert(cities).values(input);
  refresh();
}

export async function toggleCity(formData: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(formData.get("id"));
  const [row] = await db.select().from(cities).where(eq(cities.id, id));
  if (row) {
    await db
      .update(cities)
      .set({ isActive: !row.isActive })
      .where(eq(cities.id, id));
  }
  refresh();
}

export async function addOffice(formData: FormData) {
  await requireAdmin();
  const input = z
    .object({ ...names, cityId: z.uuid() })
    .parse({
      nameEn: formData.get("nameEn"),
      nameZh: formData.get("nameZh"),
      cityId: formData.get("cityId"),
    });
  await db.insert(offices).values(input);
  refresh();
}

export async function toggleOffice(formData: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(formData.get("id"));
  const [row] = await db.select().from(offices).where(eq(offices.id, id));
  if (row) {
    await db
      .update(offices)
      .set({ isActive: !row.isActive })
      .where(eq(offices.id, id));
  }
  refresh();
}

export async function addCafeteria(formData: FormData) {
  await requireAdmin();
  const input = z
    .object({ ...names, officeId: z.uuid() })
    .parse({
      nameEn: formData.get("nameEn"),
      nameZh: formData.get("nameZh"),
      officeId: formData.get("officeId"),
    });
  await db.insert(cafeterias).values(input);
  refresh();
}

export async function toggleCafeteria(formData: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(formData.get("id"));
  const [row] = await db.select().from(cafeterias).where(eq(cafeterias.id, id));
  if (row) {
    await db
      .update(cafeterias)
      .set({ isActive: !row.isActive })
      .where(eq(cafeterias.id, id));
  }
  refresh();
}
