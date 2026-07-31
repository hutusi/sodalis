# OIDC dry-run against a throwaway Keycloak

Corporate IdPs vary in claim names and quirks, and the OIDC flow is the one
integration no automated test covers. Run it once against a local Keycloak
before pointing at the real IdP.

## 1. Start Keycloak

```bash
docker run --rm -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest start-dev
```

Admin console: http://localhost:8080 (admin / admin).

## 2. Create the realm, client and a test user

1. **Realm**: create realm `sodalis-test`.
2. **Client**: Clients → Create — Client ID `sodalis`, *Client
   authentication ON* (confidential). Valid redirect URI:
   `http://localhost:3000/api/auth/callback/oidc`. Copy the client secret
   from the *Credentials* tab.
3. **User**: Users → Create (set username, email — **email is required**,
   Sodalis rejects OIDC profiles without one) → Credentials → set a
   password (temporary off).
4. **Department claim** (optional, tests attribute sync): on the user, add
   attribute `department` = `技术部`; then Client scopes →
   `sodalis-dedicated` → Add mapper → *User Attribute*: name/attribute/
   claim all `department`, add to ID token + userinfo.
5. **Admin group claim** (optional, tests grant/revoke): Groups → create
   `sodalis-admins`, add the user. Add a *Group Membership* mapper to the
   client scope: token claim name `groups`, *Full group path OFF*.

## 3. Point Sodalis at it

```bash
OIDC_ISSUER=http://localhost:8080/realms/sodalis-test
OIDC_CLIENT_ID=sodalis
OIDC_CLIENT_SECRET=<from the Credentials tab>
OIDC_ADMIN_GROUP=sodalis-admins   # only if you did step 5
```

`bun run dev`, open http://localhost:3000/login → "Sign in with Company SSO".

## 4. What to verify

- Login round-trip completes and lands on the dashboard.
- The user row (Profile page / `users` table) carries the synced name,
  email and — if mapped — department.
- With the group mapper: the user gets the admin nav (`is_admin=true,
  admin_via='group'`); remove them from the group in Keycloak, sign out and
  back in → admin revoked (reaffirmation rule, see ADR-0006).
- A user with no email in Keycloak is rejected with an error page, not a
  silent redirect loop.

Against the real IdP later, the only expected differences are the issuer
URL and claim names — map those with `OIDC_CLAIM_DEPARTMENT` /
`OIDC_CLAIM_OFFICE` / `OIDC_ADMIN_GROUP` instead of code changes.
