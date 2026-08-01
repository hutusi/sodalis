# ADR-0004: Pure seeded matching engine with penalty scoring

**Status**: Accepted · **Date**: 2026-07-30

## Context

Matching must mix departments, avoid recent repeat pairings, honor group-size
preferences ("pairs only" vs "2–4"), assign a rotating volunteer host (搭主),
and be explainable when someone asks "why this group?". Pools are small
(tens to a few hundred per office), so solver sophistication matters less
than debuggability.

## Decision

`matchEngine` is a **pure function** — no clock, no `Math.random`, no I/O —
seeded with `splitmix32(fnv1a(seed))`; identical inputs and seed produce
byte-identical output, and every production run stores its seed.

- **Scoring is penalty-based**: same department costs 3; each past co-meal
  costs 10 decayed with a 14-day half-life over a 90-day window. Cross-dept
  mixing as a *penalty on sameness* is the same optimization as a diversity
  bonus, with simpler math.
- **Construction**: pairs-only users take min-cost partners first (a
  flexible user may complete a pair); the flexible remainder decomposes into
  sizes preferring 4s then 3s (a 2 only when arithmetic forces it); greedy
  min-marginal-cost slot filling; bounded random-swap local search polishes.
- **Hosts** rotate by least-recently-hosted volunteer (derived from
  `match_groups.host_user_id`, no extra table); hostless groups are allowed.
- **`match_pairs` is a dedicated table**, not derived from group members: the
  repeat-penalty load is one indexed query, and superseding a run is a single
  `DELETE` by run id — history is always the live truth.

Rejected: ILP/optimal solvers (opaque, unneeded at this scale) and simulated
annealing (acceptance randomness complicates rerun reasoning for ~2% gain).

## Consequences

- Reruns and bug reports are reproducible from the stored seed; the engine
  has exhaustive unit tests (determinism, invariants, scoring behavior).
- Greedy + hill-climb is not optimal, only good — accepted deliberately.
- Constants (weights, half-life, windows) live in `scoring.ts` and can be
  tuned without touching the algorithm.
