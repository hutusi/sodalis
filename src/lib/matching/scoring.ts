import type { LocalDate } from "../time";

export type PoolMember = {
  userId: string;
  department: string | null;
  sizePref: "pair_only" | "flex_2_4";
  willingToHost: boolean;
};

/** "loUserId:hiUserId" — canonical unordered pair key. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export type PairHistory = ReadonlyMap<string, readonly LocalDate[]>;

// Ate together yesterday ≈ cost 10, two weeks ago ≈ 5, two months ago ≈ 0.5.
// Same department ≈ "ate together three weeks ago" — a nudge, not a wall.
export const W_REPEAT = 10;
export const HALF_LIFE_DAYS = 14;
export const W_SAME_DEPT = 3;
export const HISTORY_WINDOW_DAYS = 90;
export const HOST_WINDOW_DAYS = 180;

export function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function pairCost(
  a: PoolMember,
  b: PoolMember,
  history: PairHistory,
  today: LocalDate,
): number {
  let cost = 0;
  const meals = history.get(pairKey(a.userId, b.userId));
  if (meals) {
    for (const d of meals) {
      cost += W_REPEAT * Math.pow(0.5, daysBetween(d, today) / HALF_LIFE_DAYS);
    }
  }
  if (a.department !== null && a.department === b.department) {
    cost += W_SAME_DEPT;
  }
  return cost;
}

export function groupCost(
  members: readonly PoolMember[],
  history: PairHistory,
  today: LocalDate,
): number {
  let cost = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      cost += pairCost(members[i], members[j], history, today);
    }
  }
  return cost;
}
