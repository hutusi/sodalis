import { sql, type SQL } from "drizzle-orm";

import type { LocalDate } from "../time";

/**
 * Transaction-scoped advisory lock for one office × activity × date.
 * runMatch holds it for the whole matching transaction; the signup server
 * actions take it too, so a signup racing the matcher blocks until the run
 * commits and then re-checks the deadline instead of landing in limbo.
 */
export function matchAdvisoryLock(
  officeId: string,
  activityTypeId: string,
  date: LocalDate,
): SQL {
  const key = `${officeId}:${activityTypeId}:${date}`;
  return sql`select pg_advisory_xact_lock(hashtextextended(${key}, 42))`;
}
