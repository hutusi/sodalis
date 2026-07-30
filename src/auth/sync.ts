import { eq, ilike, or } from "drizzle-orm";

import { db } from "@/db";
import { offices, users } from "@/db/schema";
import { adminEmails } from "@/env";

export type LoginInfo = {
  email: string;
  name?: string;
  subject?: string;
  department?: string;
  /** Free-text office name from claims/LDAP; mapped against offices by name. */
  officeHint?: string;
  /** True when the IdP's group claim marks this user as an admin. */
  adminByGroup?: boolean;
};

async function resolveOfficeId(hint: string | undefined) {
  if (!hint) return undefined;
  const office = await db.query.offices.findFirst({
    where: or(ilike(offices.nameEn, hint), ilike(offices.nameZh, hint)),
  });
  return office?.id;
}

/**
 * Called on every successful sign-in. Creates the user on first login and
 * refreshes cached directory attributes afterwards. Never downgrades
 * is_admin (an admin granted in-app keeps the role even if the env list
 * changes) and never overwrites a manually locked office.
 */
export async function upsertUserFromLogin(info: LoginInfo) {
  const email = info.email.trim().toLowerCase();
  const isAdminByEnv = adminEmails.has(email) || info.adminByGroup === true;
  const officeId = await resolveOfficeId(info.officeHint);

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!existing) {
    const [created] = await db
      .insert(users)
      .values({
        email,
        name: info.name ?? email.split("@")[0],
        authSubject: info.subject,
        department: info.department,
        officeId,
        isAdmin: isAdminByEnv,
        lastLoginAt: new Date(),
      })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(users)
    .set({
      name: info.name ?? existing.name,
      authSubject: info.subject ?? existing.authSubject,
      department: info.department ?? existing.department,
      officeId:
        !existing.officeLocked && officeId ? officeId : existing.officeId,
      isAdmin: existing.isAdmin || isAdminByEnv,
      lastLoginAt: new Date(),
    })
    .where(eq(users.id, existing.id))
    .returning();
  return updated;
}
