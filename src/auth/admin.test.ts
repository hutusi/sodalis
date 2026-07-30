import { describe, expect, test } from "bun:test";

import { computeAdmin, type AdminState } from "./admin";

const none: AdminState = { isAdmin: false, adminVia: null };
const manual: AdminState = { isAdmin: true, adminVia: "manual" };
const viaEnv: AdminState = { isAdmin: true, adminVia: "env" };
const viaGroup: AdminState = { isAdmin: true, adminVia: "group" };

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

  test("group removal revokes only on logins that carry group info", () => {
    expect(
      computeAdmin(
        { groupsKnown: true, adminByGroup: false },
        "a@corp.example.com",
        viaGroup,
        NO_EMAILS,
      ),
    ).toEqual(none);
    // LDAP/dev login: no group info → grant survives.
    expect(
      computeAdmin({}, "a@corp.example.com", viaGroup, NO_EMAILS),
    ).toEqual(viaGroup);
  });

  test("manual grants are sticky against every login signal", () => {
    // Present in env list: provenance must NOT flip to env (which would
    // make the manual grant revocable by later env-list removal).
    expect(computeAdmin({}, "boss@corp.example.com", manual, EMAILS)).toEqual(
      manual,
    );
    // In the IdP group: same.
    expect(
      computeAdmin(
        { groupsKnown: true, adminByGroup: true },
        "a@corp.example.com",
        manual,
        NO_EMAILS,
      ),
    ).toEqual(manual);
    // Absent from both: still admin.
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

  test("unknown provenance on an existing admin is left untouched", () => {
    const unknown: AdminState = { isAdmin: true, adminVia: null };
    expect(
      computeAdmin(
        { groupsKnown: true, adminByGroup: false },
        "a@corp.example.com",
        unknown,
        NO_EMAILS,
      ),
    ).toEqual(unknown);
  });
});
