import { eq, ilike, or } from "drizzle-orm";

import { db } from "@/db";
import { offices, users } from "@/db/schema";
import { adminEmails } from "@/env";
import { computeAdmin } from "./admin";

export type LoginInfo = {
  email: string;
  name?: string;
  subject?: string;
  department?: string;
  /** Free-text office name from claims/LDAP; mapped against offices by name. */
  officeHint?: string;
  /** True when the IdP's group claim marks this user as an admin. */
  adminByGroup?: boolean;
  /**
   * True only when this login actually conveyed group membership (OIDC with
   * OIDC_ADMIN_GROUP configured and a groups claim present). LDAP/dev logins
   * leave it false so they never revoke group-derived admin.
   */
  groupsKnown?: boolean;
};

async function resolveOfficeId(hint: string | undefined) {
  if (!hint) return undefined;
  const office = await db.query.offices.findFirst({
    where: or(ilike(offices.nameEn, hint), ilike(offices.nameZh, hint)),
  });
  return office?.id;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "23505";
}

/**
 * Called on every successful sign-in. Looks the user up by the stable OIDC
 * subject first (so a corporate email change updates the row instead of
 * colliding with the auth_subject unique index), then by email. Creates the
 * user on first login and refreshes cached directory attributes afterwards.
 * A manually locked office is never overwritten.
 */
export async function upsertUserFromLogin(info: LoginInfo) {
  const email = info.email.trim().toLowerCase();
  const officeId = await resolveOfficeId(info.officeHint);

  let existing = info.subject
    ? await db.query.users.findFirst({
        where: eq(users.authSubject, info.subject),
      })
    : undefined;
  existing ??= await db.query.users.findFirst({ where: eq(users.email, email) });

  const admin = computeAdmin(
    info,
    email,
    existing
      ? { isAdmin: existing.isAdmin, adminVia: existing.adminVia }
      : { isAdmin: false, adminVia: null },
    adminEmails,
  );

  if (!existing) {
    const [created] = await db
      .insert(users)
      .values({
        email,
        name: info.name ?? email.split("@")[0],
        authSubject: info.subject,
        department: info.department,
        officeId,
        isAdmin: admin.isAdmin,
        adminVia: admin.adminVia,
        lastLoginAt: new Date(),
      })
      .returning();
    return created;
  }

  const updates = {
    name: info.name ?? existing.name,
    authSubject: info.subject ?? existing.authSubject,
    department: info.department ?? existing.department,
    officeId: !existing.officeLocked && officeId ? officeId : existing.officeId,
    isAdmin: admin.isAdmin,
    adminVia: admin.adminVia,
    lastLoginAt: new Date(),
  };

  try {
    const [updated] = await db
      .update(users)
      .set({ ...updates, email })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  } catch (error) {
    // The new email already belongs to another (stale) account; keep the
    // old address rather than blocking the login.
    if (!isUniqueViolation(error)) throw error;
    // No PII in logs: identify the affected row by id only.
    console.warn(
      `[auth] login email change for user ${existing.id} collided with another account; keeping the previous address`,
    );
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }
}
