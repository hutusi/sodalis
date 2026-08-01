# OIDC dry-run against a throwaway Keycloak

Corporate IdPs vary in claim names and quirks, and the OIDC flow is the one
integration no automated test covers. Run it once against a local Keycloak
before pointing at the real IdP.

## 1. Start Keycloak

Bind to loopback only and generate the admin password — even a throwaway
realm must not be administrable by others on the network. Run this on your
own machine, not a shared or exposed host.

```bash
KC_PASS=$(openssl rand -hex 12) && echo "Keycloak admin password: $KC_PASS"
docker run --rm -p 127.0.0.1:8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD="$KC_PASS" \
  quay.io/keycloak/keycloak:latest start-dev
```

Admin console: http://localhost:8080 (admin / the generated password).

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

A passing dry-run validates the flow, not the corporate IdP's specifics.
Claim *names* map via `OIDC_CLAIM_DEPARTMENT` / `OIDC_CLAIM_OFFICE`;
`OIDC_ADMIN_GROUP` is different — it is the exact group *value* looked up
inside the (hard-coded) `groups` claim, e.g. `sodalis-admins`, not a claim
name. Both work without code changes, but confirm the rest with your IdP
team before production:

- required scopes beyond `openid profile email`, and whether claims arrive
  in the ID token or only via the userinfo endpoint;
- client-authentication method (client secret vs private key JWT) and
  whether PKCE is mandatory;
- group-claim shape — names vs full paths (Sodalis matches
  `OIDC_ADMIN_GROUP` by exact string), and whether groups are in the token
  at all;
- discovery metadata reachability from the app host (issuer URL must serve
  `/.well-known/openid-configuration` on the intranet).
