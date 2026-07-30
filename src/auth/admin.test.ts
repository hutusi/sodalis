import { describe, expect, test } from "bun:test";

import { computeAdmin, type AdminState } from "./admin";

const none: AdminState = { isAdmin: false, adminVia: null };
const manual: AdminState = { isAdmin: true, adminVia: "manual" };
const viaEnv: AdminState = { isAdmin: true, adminVia: "env" };
const viaGroup: AdminState = { isAdmin: true, adminVia: "group" };
const unknown: AdminState = { isAdmin: true, adminVia: null };

const EMAILS = new Set(["boss@corp.example.com"]);
const NO_EMAILS = new Set<string>();

describe("computeAdmin", () => {
  test("env list grants with env provenance", () => {
    expect(computeAdmin({}, "boss@corp.example.com", none, EMAILS)).toEqual(
      viaEnv,
    );
  });

  test("OIDC group grants with group provenance", () => {
    expect(
      computeAdmin(
        { groupsKnown: true, adminByGroup: true },
        "a@corp.example.com",
        none,
        NO_EMAILS,
      ),
    ).toEqual(viaGroup);
  });

  test("group claim without groupsKnown grants nothing", () => {
    expect(
      computeAdmin({ adminByGroup: true }, "a@corp.example.com", none, NO_EMAILS),
    ).toEqual(none);
  });

  test("env removal revokes an env grant on any login", () => {
    expect(computeAdmin({}, "ex@corp.example.com", viaEnv, NO_EMAILS)).toEqual(
      none,
    );
  });

  test("group grants require reaffirmation: any unconfirming login revokes", () => {
    // OIDC login, no longer in the group.
    expect(
      computeAdmin(
        { groupsKnown: true, adminByGroup: false },
        "a@corp.example.com",
        viaGroup,
        NO_EMAILS,
      ),
    ).toEqual(none);
    // LDAP login (no group signal): also revokes — otherwise a removed
    // admin could dodge revocation forever by only using LDAP.
    expect(computeAdmin({}, "a@corp.example.com", viaGroup, NO_EMAILS)).toEqual(
      none,
    );
    // Reaffirming OIDC login keeps it.
    expect(
      computeAdmin(
        { groupsKnown: true, adminByGroup: true },
        "a@corp.example.com",
        viaGroup,
        NO_EMAILS,
      ),
    ).toEqual(viaGroup);
  });

  test("manual grants are sticky against every login signal", () => {
    expect(computeAdmin({}, "boss@corp.example.com", manual, EMAILS)).toEqual(
      manual,
    );
    expect(
      computeAdmin(
        { groupsKnown: true, adminByGroup: true },
        "a@corp.example.com",
        manual,
        NO_EMAILS,
      ),
    ).toEqual(manual);
    expect(
      computeAdmin(
        { groupsKnown: true, adminByGroup: false },
        "a@corp.example.com",
        manual,
        NO_EMAILS,
      ),
    ).toEqual(manual);
  });

  test("env beats group for a non-manual user", () => {
    expect(
      computeAdmin(
        { groupsKnown: true, adminByGroup: true },
        "boss@corp.example.com",
        none,
        EMAILS,
      ),
    ).toEqual(viaEnv);
  });

  test("unknown provenance resolves on an informative login", () => {
    // Env-listed → classified as env (revocable by env removal later).
    expect(
      computeAdmin({}, "boss@corp.example.com", unknown, EMAILS),
    ).toEqual(viaEnv);
    // Group-confirmed → classified as group.
    expect(
      computeAdmin(
        { groupsKnown: true, adminByGroup: true },
        "a@corp.example.com",
        unknown,
        NO_EMAILS,
      ),
    ).toEqual(viaGroup);
    // Groups checkable, backed by neither source → revoked.
    expect(
      computeAdmin(
        { groupsKnown: true, adminByGroup: false },
        "a@corp.example.com",
        unknown,
        NO_EMAILS,
      ),
    ).toEqual(none);
  });

  test("unknown provenance survives an uninformative login", () => {
    // LDAP login, not env-listed, groups unknowable → cannot judge, keep.
    expect(computeAdmin({}, "a@corp.example.com", unknown, NO_EMAILS)).toEqual(
      unknown,
    );
  });
});
