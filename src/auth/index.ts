import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { env } from "@/env";
import { ldapAuthenticate } from "./ldap";
import { upsertUserFromLogin, type LoginInfo } from "./sync";

export const oidcEnabled = Boolean(
  env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET,
);
export const ldapEnabled = Boolean(env.LDAP_URL && env.LDAP_BIND_DN_TEMPLATE);
export const devLoginEnabled =
  env.DEV_LOGIN_ENABLED && env.NODE_ENV !== "production";

declare module "next-auth" {
  interface Session {
    user: {
      /** Our users.id (not the IdP subject). */
      id: string;
      email?: string | null;
      name?: string | null;
    };
  }
}

const providers: NextAuthConfig["providers"] = [];

if (oidcEnabled) {
  providers.push({
    id: "oidc",
    name: "Company SSO",
    type: "oidc",
    issuer: env.OIDC_ISSUER,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
  });
}

if (ldapEnabled) {
  providers.push(
    Credentials({
      id: "ldap",
      name: "LDAP",
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const info = await ldapAuthenticate(
          String(credentials?.username ?? ""),
          String(credentials?.password ?? ""),
        );
        if (!info) return null;
        const user = await upsertUserFromLogin(info);
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email" } },
      async authorize(credentials) {
        // Only pre-seeded users can dev-login; this never creates accounts.
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (!user) return null;
        await db
          .update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id));
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  trustHost: true,
  secret: env.AUTH_SECRET,
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // Runs with `account` set only on sign-in; afterwards the uid rides
      // along in the JWT. Fresh user data is always re-read from the DB by
      // requireUser(), so the token stays minimal.
      if (account?.provider === "oidc" && profile) {
        const claims = profile as Record<string, unknown>;
        const groups = claims["groups"];
        const info: LoginInfo = {
          email: String(profile.email ?? token.email ?? ""),
          name: typeof profile.name === "string" ? profile.name : undefined,
          subject: account.providerAccountId,
          department:
            typeof claims[env.OIDC_CLAIM_DEPARTMENT] === "string"
              ? (claims[env.OIDC_CLAIM_DEPARTMENT] as string)
              : undefined,
          officeHint:
            typeof claims[env.OIDC_CLAIM_OFFICE] === "string"
              ? (claims[env.OIDC_CLAIM_OFFICE] as string)
              : undefined,
          adminByGroup:
            env.OIDC_ADMIN_GROUP !== undefined &&
            Array.isArray(groups) &&
            groups.includes(env.OIDC_ADMIN_GROUP),
        };
        if (info.email) {
          const dbUser = await upsertUserFromLogin(info);
          token.uid = dbUser.id;
        }
      } else if (account && user?.id) {
        // Credentials providers (ldap/dev) already upserted in authorize().
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      return session;
    },
  },
});
