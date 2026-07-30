import { describe, expect, test } from "bun:test";

import { decomposeSizes, matchEngine, type EngineInput } from "./engine";
import { pairKey, type PoolMember } from "./scoring";

function member(
  id: string,
  opts: Partial<Omit<PoolMember, "userId">> = {},
): PoolMember {
  return {
    userId: id,
    department: opts.department ?? null,
    sizePref: opts.sizePref ?? "flex_2_4",
    willingToHost: opts.willingToHost ?? false,
  };
}

function baseInput(pool: PoolMember[], seed = "test-seed"): EngineInput {
  return {
    pool,
    pairHistory: new Map(),
    hostStats: new Map(),
    cafeteriaIds: ["caf-1", "caf-2"],
    today: "2026-07-30",
    seed,
  };
}

function makePool(n: number, prefix = "u"): PoolMember[] {
  return Array.from({ length: n }, (_, i) =>
    member(`${prefix}${String(i).padStart(3, "0")}`, {
      department: `dept-${i % 5}`,
      willingToHost: i % 3 === 0,
    }),
  );
}

describe("decomposeSizes", () => {
  test("covers all residues and sums to n with sizes 2–4", () => {
    for (let n = 2; n <= 50; n++) {
      const sizes = decomposeSizes(n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      for (const s of sizes) {
        expect(s).toBeGreaterThanOrEqual(2);
        expect(s).toBeLessThanOrEqual(4);
      }
      // At most one group smaller than 4 except the [3,3] / [3,2] tails.
      expect(sizes.filter((s) => s !== 4).length).toBeLessThanOrEqual(2);
    }
  });
});

describe("matchEngine determinism", () => {
  test("same input and seed → identical output", () => {
    const pool = makePool(37);
    const a = matchEngine(baseInput(pool, "seed-A"));
    const b = matchEngine(baseInput(pool, "seed-A"));
    expect(a).toEqual(b);
  });

  test("different seed → different grouping (for this pool)", () => {
    const pool = makePool(37);
    const a = matchEngine(baseInput(pool, "seed-A"));
    const b = matchEngine(baseInput(pool, "seed-B"));
    expect(JSON.stringify(a.groups)).not.toBe(JSON.stringify(b.groups));
  });

  test("input order does not matter", () => {
    const pool = makePool(20);
    const reversed = [...pool].reverse();
    const a = matchEngine(baseInput(pool));
    const b = matchEngine(baseInput(reversed));
    expect(a).toEqual(b);
  });
});

describe("matchEngine invariants", () => {
  const poolSizes = [2, 3, 4, 5, 6, 7, 9, 13, 30, 101];

  test("everyone is placed exactly once or unmatched", () => {
    for (const n of poolSizes) {
      const pool = makePool(n);
      const r = matchEngine(baseInput(pool));
      const seen = new Set<string>();
      for (const g of r.groups) for (const id of g.members) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      for (const id of r.unmatched) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      expect(seen.size).toBe(n);
    }
  });

  test("group sizes stay within 2–5", () => {
    for (const n of poolSizes) {
      const r = matchEngine(baseInput(makePool(n)));
      for (const g of r.groups) {
        expect(g.members.length).toBeGreaterThanOrEqual(2);
        expect(g.members.length).toBeLessThanOrEqual(5);
      }
    }
  });

  test("pair-only members are always in groups of exactly 2", () => {
    const pool = makePool(23);
    for (let i = 0; i < pool.length; i += 4) {
      pool[i] = { ...pool[i], sizePref: "pair_only" };
    }
    const r = matchEngine(baseInput(pool));
    const pairOnlyIds = new Set(
      pool.filter((m) => m.sizePref === "pair_only").map((m) => m.userId),
    );
    for (const g of r.groups) {
      if (g.members.some((id) => pairOnlyIds.has(id))) {
        expect(g.members.length).toBe(2);
      }
    }
  });

  test("pool of one → unmatched with apology, no groups", () => {
    const r = matchEngine(baseInput([member("only-one")]));
    expect(r.groups).toEqual([]);
    expect(r.unmatched).toEqual(["only-one"]);
  });

  test("host comes from volunteers; hostless groups allowed", () => {
    const volunteers = new Set(["u000", "u003"]);
    const pool = [
      member("u000", { willingToHost: true }),
      member("u001"),
      member("u002"),
      member("u003", { willingToHost: true }),
      member("u004"),
      member("u005"),
    ];
    const r = matchEngine(baseInput(pool));
    for (const g of r.groups) {
      if (g.hostUserId !== null) {
        expect(volunteers.has(g.hostUserId)).toBe(true);
        expect(g.members).toContain(g.hostUserId);
      } else {
        expect(g.members.some((id) => volunteers.has(id))).toBe(false);
      }
    }
  });

  test("venue is one of the offered cafeterias", () => {
    const r = matchEngine(baseInput(makePool(8)));
    for (const g of r.groups) {
      expect(["caf-1", "caf-2"]).toContain(g.cafeteriaId ?? "");
    }
  });
});

describe("matchEngine scoring behavior", () => {
  test("avoids re-matching a recent pair when alternatives exist", () => {
    // Four pairs-only users; A and B ate together yesterday.
    const pool = [
      member("A", { sizePref: "pair_only" }),
      member("B", { sizePref: "pair_only" }),
      member("C", { sizePref: "pair_only" }),
      member("D", { sizePref: "pair_only" }),
    ];
    const input = {
      ...baseInput(pool),
      pairHistory: new Map([[pairKey("A", "B"), ["2026-07-29"]]]),
    };
    const r = matchEngine(input);
    const groupOfA = r.groups.find((g) => g.members.includes("A"));
    expect(groupOfA?.members).not.toContain("B");
  });

  test("prefers cross-department pairs", () => {
    const pool = [
      member("A", { sizePref: "pair_only", department: "eng" }),
      member("B", { sizePref: "pair_only", department: "eng" }),
      member("C", { sizePref: "pair_only", department: "sales" }),
      member("D", { sizePref: "pair_only", department: "sales" }),
    ];
    const r = matchEngine(baseInput(pool));
    for (const g of r.groups) {
      const depts = g.members.map(
        (id) => pool.find((m) => m.userId === id)?.department,
      );
      expect(new Set(depts).size).toBe(2);
    }
  });

  test("repeat penalty decays: prefers the older acquaintance", () => {
    // A must pair with B or C; ate with B yesterday, with C two months ago.
    const pool = [
      member("A", { sizePref: "pair_only" }),
      member("B", { sizePref: "pair_only" }),
      member("C", { sizePref: "pair_only" }),
    ];
    const input = {
      ...baseInput(pool),
      pairHistory: new Map([
        [pairKey("A", "B"), ["2026-07-29"]],
        [pairKey("A", "C"), ["2026-05-30"]],
        // B and C also just ate together, so pairing them is expensive too;
        // the cheapest arrangement leaves one of the recents unpaired.
        [pairKey("B", "C"), ["2026-07-29"]],
      ]),
    };
    const r = matchEngine(input);
    // Exactly one pair forms (3 pairs-only users), one goes unmatched.
    expect(r.groups.length).toBe(1);
    expect(r.unmatched.length).toBe(1);
    // The formed pair should be the cheapest one: A–C (decayed history).
    expect(r.groups[0].members.sort()).toEqual(["A", "C"]);
  });

  test("host rotation prefers never-hosted, then longest ago", () => {
    const pool = [
      member("A", { willingToHost: true }),
      member("B", { willingToHost: true }),
      member("C"),
      member("D"),
    ];
    const input = {
      ...baseInput(pool),
      hostStats: new Map([
        ["A", { lastHostedDate: "2026-07-01", count: 3 }],
        // B never hosted.
      ]),
    };
    const r = matchEngine(input);
    const group = r.groups.find(
      (g) => g.members.includes("A") && g.members.includes("B"),
    );
    expect(group?.hostUserId).toBe("B");
  });
});
