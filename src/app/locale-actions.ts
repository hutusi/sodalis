"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Persist on the profile too so emails use the same language.
  const session = await auth();
  if (session?.user?.id) {
    await db
      .update(users)
      .set({ locale })
      .where(eq(users.id, session.user.id));
  }

  revalidatePath("/", "layout");
}
