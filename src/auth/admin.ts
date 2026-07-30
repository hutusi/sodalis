export type AdminVia = "manual" | "env" | "group" | null;

export type AdminState = { isAdmin: boolean; adminVia: AdminVia };

export type AdminSignals = {
  /** True when the IdP's group claim marks this user as an admin. */
  adminByGroup?: boolean;
  /**
   * True only when this login actually conveyed group membership (OIDC with
   * OIDC_ADMIN_GROUP configured and a groups claim present).
   */
  groupsKnown?: boolean;
};

/**
 * Effective admin, recomputed per login with source provenance. Rules:
 *  - 'manual' grants are sticky: only an explicit in-app/DB action changes
 *    them; no login signal (presence OR absence of env/group membership)
 *    does. This makes a manual grant safe for a user who also happens to
 *    be in the env list or IdP group.
 *  - env list beats group when both apply to a non-manual user.
 *  - env grants revoke when the email leaves ADMIN_EMAILS (checkable on
 *    every login).
 *  - group grants require REAFFIRMATION: any login that does not carry a
 *    positive group signal — LDAP, dev, or OIDC without group config —
 *    revokes them. The alternative (only revoke on informative logins)
 *    lets a removed admin dodge revocation forever by authenticating via
 *    LDAP only. Cost: an SSO-group admin using the LDAP fallback loses
 *    admin until their next SSO login. Deliberate: for a security control,
 *    a transiently under-privileged admin beats a permanently
 *    over-privileged one.
 *  - null provenance ("unknown", e.g. pre-provenance backfill) resolves on
 *    the first informative login: env-listed → env, group-confirmed →
 *    group, otherwise (when groups were checkable) → revoked. Uninformative
 *    logins leave it untouched. Reviewers disagreed here — revocability
 *    won: a misclassified legacy manual grant is one admin action to
 *    restore, an unrevocable external grant is a standing hole.
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
    if (current.adminVia === "group") {
      return { isAdmin: false, adminVia: null };
    }
    // adminVia === null: unknown provenance. An informative login that
    // reached this point found neither env nor group backing → revoke;
    // an uninformative one cannot judge → keep.
    if (signals.groupsKnown) return { isAdmin: false, adminVia: null };
  }
  return current;
}
