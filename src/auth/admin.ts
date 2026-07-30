export type AdminVia = "manual" | "env" | "group" | null;

export type AdminState = { isAdmin: boolean; adminVia: AdminVia };

export type AdminSignals = {
  /** True when the IdP's group claim marks this user as an admin. */
  adminByGroup?: boolean;
  /**
   * True only when this login actually conveyed group membership (OIDC with
   * OIDC_ADMIN_GROUP configured and a groups claim present). LDAP/dev logins
   * leave it false so they never revoke group-derived admin.
   */
  groupsKnown?: boolean;
};

/**
 * Effective admin, recomputed per login with source provenance. Rules:
 *  - 'manual' grants are sticky: no login-derived signal (presence OR
 *    absence of env/group membership) may change them — only an explicit
 *    in-app/DB action can. This is what makes a manual grant safe for a
 *    user who also happens to be in the env list or IdP group.
 *  - env list beats group when both apply to a non-manual user.
 *  - Each remaining source revokes only its own grants, and only when the
 *    login carries that source's signal: the env list is always checkable;
 *    group membership only on logins with groupsKnown.
 *  - Unknown provenance (null) on an existing admin is left untouched.
 */
export function computeAdmin(
  signals: AdminSignals,
  email: string,
  current: AdminState,
  adminEmailSet: ReadonlySet<string>,
): AdminState {
  if (current.isAdmin && current.adminVia === "manual") return current;
  if (adminEmailSet.has(email)) return { isAdmin: true, adminVia: "env" };
  if (signals.groupsKnown && signals.adminByGroup) {
    return { isAdmin: true, adminVia: "group" };
  }
  if (current.isAdmin) {
    if (current.adminVia === "env") return { isAdmin: false, adminVia: null };
    if (current.adminVia === "group" && signals.groupsKnown) {
      return { isAdmin: false, adminVia: null };
    }
  }
  return current;
}
