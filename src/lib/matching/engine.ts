import type { LocalDate } from "../time";
import { fnv1a, shuffle, splitmix32 } from "./rng";
import {
  groupCost,
  pairCost,
  type PairHistory,
  type PoolMember,
} from "./scoring";

export type HostStats = ReadonlyMap<
  string,
  { lastHostedDate: LocalDate | null; count: number }
>;

export type EngineInput = {
  pool: readonly PoolMember[];
  pairHistory: PairHistory;
  hostStats: HostStats;
  cafeteriaIds: readonly string[];
  today: LocalDate;
  seed: string;
};

export type EngineGroup = {
  members: string[];
  hostUserId: string | null;
  cafeteriaId: string | null;
};

export type EngineResult = {
  groups: EngineGroup[];
  unmatched: string[];
  totalCost: number;
};

const EPS = 1e-9;

/**
 * Pure and deterministic: no clock, no Math.random, no I/O. Identical
 * inputs + seed produce byte-identical output, which is what makes re-runs
 * debuggable and tests trustworthy.
 *
 * Phases: (1) place pairs-only users into twosomes, (2) decompose the
 * remaining flexible pool into sizes preferring 4s then 3s and fill slots
 * greedily by marginal cost, (3) random-swap local search, (4) pick hosts
 * by rotation fairness and a venue per group.
 */
export function matchEngine(input: EngineInput): EngineResult {
  const rng = splitmix32(fnv1a(input.seed));
  const pool = [...input.pool].sort((a, b) =>
    a.userId < b.userId ? -1 : 1,
  );
  const cost = (a: PoolMember, b: PoolMember) =>
    pairCost(a, b, input.pairHistory, input.today);

  const placed = new Set<string>();
  const unmatched: string[] = [];
  /** groups[i] paired with pairAnchored[i]: size locked at 2. */
  const groups: PoolMember[][] = [];
  const pairAnchored: boolean[] = [];

  // ---- Phase 1: pairs-only users -----------------------------------------
  // A pair-only user's partner may itself be flexible (2 is within 2–4).
  const pairOnly = shuffle(
    pool.filter((m) => m.sizePref === "pair_only"),
    rng,
  );
  for (const u of pairOnly) {
    if (placed.has(u.userId)) continue;
    let best: PoolMember | null = null;
    let bestCost = Infinity;
    for (const v of pool) {
      if (v.userId === u.userId || placed.has(v.userId)) continue;
      const c = cost(u, v);
      if (
        c < bestCost - EPS ||
        (Math.abs(c - bestCost) <= EPS && best !== null && v.userId < best.userId)
      ) {
        best = v;
        bestCost = c;
      }
    }
    if (best) {
      groups.push([u, best]);
      pairAnchored.push(true);
      placed.add(u.userId);
      placed.add(best.userId);
    } else {
      // Terminal for this run: a partnerless pairs-only user must not fall
      // through to the flexible pool.
      unmatched.push(u.userId);
      placed.add(u.userId);
    }
  }

  // ---- Phase 2: size decomposition for the flexible remainder ------------
  const remaining = shuffle(
    pool.filter((m) => m.sizePref === "flex_2_4" && !placed.has(m.userId)),
    rng,
  );

  if (remaining.length === 1) {
    // A lone leftover can only join a group whose members are all flexible;
    // pair-anchored twosomes cannot grow. (With the current decomposition
    // this rarely triggers, but it keeps the invariant local.)
    const lone = remaining[0];
    let target = -1;
    for (let i = 0; i < groups.length; i++) {
      if (pairAnchored[i] || groups[i].length >= 5) continue;
      if (target === -1 || groups[i].length < groups[target].length) target = i;
    }
    if (target >= 0) groups[target].push(lone);
    else unmatched.push(lone.userId);
  } else if (remaining.length > 1) {
    const sizes = decomposeSizes(remaining.length);
    let cursor = 0;
    for (const size of sizes) {
      const group: PoolMember[] = [remaining[cursor++]];
      while (group.length < size) {
        // Cheapest marginal addition against the members already seated.
        let best = -1;
        let bestCost = Infinity;
        for (let i = cursor; i < remaining.length; i++) {
          if (group.some((g) => g.userId === remaining[i].userId)) continue;
          let marginal = 0;
          for (const g of group) marginal += cost(g, remaining[i]);
          if (
            marginal < bestCost - EPS ||
            (Math.abs(marginal - bestCost) <= EPS &&
              best >= 0 &&
              remaining[i].userId < remaining[best].userId)
          ) {
            best = i;
            bestCost = marginal;
          }
        }
        // Move the chosen member up to the cursor position.
        [remaining[cursor], remaining[best]] = [remaining[best], remaining[cursor]];
        group.push(remaining[cursor++]);
      }
      groups.push(group);
      pairAnchored.push(false);
    }
  }

  // ---- Phase 3: local search (swap improvement) --------------------------
  const totalMembers = groups.reduce((s, g) => s + g.length, 0);
  const iterations = Math.min(3000, 40 * totalMembers);
  const gc = (g: PoolMember[]) => groupCost(g, input.pairHistory, input.today);
  if (groups.length >= 2) {
    for (let iter = 0; iter < iterations; iter++) {
      const i = Math.floor(rng() * groups.length);
      let j = Math.floor(rng() * (groups.length - 1));
      if (j >= i) j++;
      const g1 = groups[i];
      const g2 = groups[j];
      const ai = Math.floor(rng() * g1.length);
      const bi = Math.floor(rng() * g2.length);
      const a = g1[ai];
      const b = g2[bi];
      // A pairs-only member may only ever sit in a group of exactly 2.
      if (a.sizePref === "pair_only" && g2.length !== 2) continue;
      if (b.sizePref === "pair_only" && g1.length !== 2) continue;
      const before = gc(g1) + gc(g2);
      g1[ai] = b;
      g2[bi] = a;
      const after = gc(g1) + gc(g2);
      if (after >= before - EPS) {
        g1[ai] = a;
        g2[bi] = b;
      }
    }
  }

  // ---- Phase 4: hosts and venues -----------------------------------------
  const cafeteriaIds = [...input.cafeteriaIds].sort();
  const result: EngineGroup[] = groups.map((g) => {
    const candidates = g.filter((m) => m.willingToHost);
    let host: PoolMember | null = null;
    for (const c of candidates) {
      if (host === null) {
        host = c;
        continue;
      }
      if (hostOrder(c, host, input.hostStats) < 0) host = c;
    }
    const cafeteriaId =
      cafeteriaIds.length > 0
        ? cafeteriaIds[Math.floor(rng() * cafeteriaIds.length)]
        : null;
    return {
      members: g.map((m) => m.userId),
      hostUserId: host?.userId ?? null,
      cafeteriaId,
    };
  });

  return {
    groups: result,
    unmatched,
    totalCost: groups.reduce((s, g) => s + gc(g), 0),
  };
}

/**
 * Split n flexible users (n >= 2) into group sizes, preferring 4s, then 3s;
 * a 2 only when arithmetic forces it. Invariant: sum(sizes) === n, all
 * sizes in {2,3,4}.
 */
export function decomposeSizes(n: number): number[] {
  if (n < 2) throw new Error("decomposeSizes needs n >= 2");
  switch (n % 4) {
    case 0:
      return Array(n / 4).fill(4);
    case 3:
      return [...Array((n - 3) / 4).fill(4), 3];
    case 2:
      return n === 2 ? [2] : [...Array((n - 6) / 4).fill(4), 3, 3];
    default: // n % 4 === 1, n >= 5
      return [...Array((n - 5) / 4).fill(4), 3, 2];
  }
}

/** Rotation fairness: never/longest-ago hosted first, then fewest times. */
function hostOrder(
  a: PoolMember,
  b: PoolMember,
  stats: HostStats,
): number {
  const sa = stats.get(a.userId) ?? { lastHostedDate: null, count: 0 };
  const sb = stats.get(b.userId) ?? { lastHostedDate: null, count: 0 };
  if (sa.lastHostedDate === null && sb.lastHostedDate !== null) return -1;
  if (sa.lastHostedDate !== null && sb.lastHostedDate === null) return 1;
  if (sa.lastHostedDate !== null && sb.lastHostedDate !== null) {
    if (sa.lastHostedDate < sb.lastHostedDate) return -1;
    if (sa.lastHostedDate > sb.lastHostedDate) return 1;
  }
  if (sa.count !== sb.count) return sa.count - sb.count;
  return a.userId < b.userId ? -1 : 1;
}
