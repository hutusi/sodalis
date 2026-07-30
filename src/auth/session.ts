import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from ".";

export type CurrentUser = NonNullable<
  Awaited<ReturnType<typeof loadCurrentUser>>
>;

async function loadCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  return user ?? null;
}

/** Redirects to /login when unauthenticated; always returns fresh DB data. */
export async function requireUser() {
  const user = await loadCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}
