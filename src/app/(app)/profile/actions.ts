"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/auth/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { LOCALE_COOKIE } from "@/i18n/config";

const profileInput = z.object({
  officeId: z.uuid().nullable(),
  locale: z.enum(["en", "zh-CN"]),
  contactExtra: z.string().trim().max(200),
  contactVisible: z.boolean(),
});

export async function saveProfile(formData: FormData) {
  const user = await requireUser();
  const raw = formData.get("officeId");
  const input = profileInput.parse({
    officeId: raw === "" || raw === null ? null : raw,
    locale: formData.get("locale"),
    contactExtra: formData.get("contactExtra") ?? "",
    contactVisible: formData.get("contactVisible") === "on",
  });

  await db
    .update(users)
    .set({
      officeId: input.officeId,
      // A manual office choice wins over SSO hints from then on.
      officeLocked: user.officeLocked || input.officeId !== user.officeId,
      locale: input.locale,
      contactExtra: input.contactExtra || null,
      contactVisible: input.contactVisible,
    })
    .where(eq(users.id, user.id));

  const store = await cookies();
  store.set(LOCALE_COOKIE, input.locale, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
