import { Client } from "ldapts";

import { env } from "@/env";
import type { LoginInfo } from "./sync";

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  if (value instanceof Buffer) return value.toString("utf-8");
  return undefined;
}

// The username is substituted into a DN template; RFC 4514 special
// characters could alter the RDN structure. Corporate account names are
// alphanumeric-ish, so rejecting beats escaping.
const SAFE_USERNAME = /^[A-Za-z0-9._@-]+$/;

/**
 * Bind-as-user authentication. The DN is built from LDAP_BIND_DN_TEMPLATE
 * ("uid={username},ou=people,dc=corp"); after a successful bind the user's
 * own entry is read for directory attributes (names configurable per env,
 * since they vary wildly between directories).
 */
export async function ldapAuthenticate(
  username: string,
  password: string,
): Promise<LoginInfo | null> {
  if (!env.LDAP_URL || !env.LDAP_BIND_DN_TEMPLATE) return null;
  if (!username || !password) return null;
  if (!SAFE_USERNAME.test(username)) return null;

  const dn = env.LDAP_BIND_DN_TEMPLATE.replaceAll("{username}", username);
  // Bounded timeouts: an unresponsive directory must not hang logins.
  const client = new Client({
    url: env.LDAP_URL,
    connectTimeout: 5_000,
    timeout: 10_000,
  });
  try {
    await client.bind(dn, password);
    const { searchEntries } = await client.search(dn, {
      scope: "base",
      attributes: [
        env.LDAP_ATTR_MAIL,
        env.LDAP_ATTR_DISPLAY_NAME,
        env.LDAP_ATTR_DEPARTMENT,
        env.LDAP_ATTR_OFFICE,
      ],
    });
    const entry = searchEntries[0] ?? {};
    const email = firstString(entry[env.LDAP_ATTR_MAIL]);
    if (!email) return null;
    return {
      email,
      name: firstString(entry[env.LDAP_ATTR_DISPLAY_NAME]),
      department: firstString(entry[env.LDAP_ATTR_DEPARTMENT]),
      officeHint: firstString(entry[env.LDAP_ATTR_OFFICE]),
    };
  } catch {
    return null;
  } finally {
    await client.unbind().catch(() => {});
  }
}
