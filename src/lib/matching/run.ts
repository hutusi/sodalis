import { and, count, eq, gte, inArray, isNotNull, like, max } from "drizzle-orm";

import { db } from "@/db";
import {
  activityTypes,
  cafeterias,
  matchGroupMembers,
  matchGroups,
  matchPairs,
  matchRuns,
  notifications,
  offices,
  signups,
  users,
} from "@/db/schema";
import type { HolidayMap } from "../calendar";
import type { NotificationPayload } from "../notify/types";
import { materializeStanding } from "../scheduling/materialize";
import { addDays, type LocalDate } from "../time";
import { matchEngine, type HostStats } from "./engine";
import { matchAdvisoryLock } from "./lock";
import {
  HISTORY_WINDOW_DAYS,
  HOST_WINDOW_DAYS,
  pairKey,
  type PoolMember,
} from "./scoring";

export const LIVE_STATUSES = ["pending", "running", "completed"] as const;

export type RunMatchOptions = {
  officeId: string;
  activityTypeId: string;
  date: LocalDate;
  trigger: "scheduler" | "manual";
  triggeredByUserId?: string;
  /**
   * Materialize standing signups inside this run's locked transaction,
   * atomically with the pool snapshot — a concurrent run can't slip between
   * materialization and matching. Only rules unchanged since `updatedBefore`
   * (the close instant) apply: without rule history we cannot reconstruct
   * close-time state, so an after-close edit excludes the rule for that day
   * (fails safe) and users are materialized into their *current* office
   * (no duplication — user×activity×date is unique — and no race, since
   * the insert happens under this office's own lock). Passed by both the
   * scheduler's catch-up window and the admin re-run, so a failed catch-up
   * remains recoverable manually; on healthy re-runs it no-ops via the
   * unique key.
   */
  catchUpMaterialize?: { holidays: HolidayMap; updatedBefore: Date };
};

export type RunMatchResult =
  | { outcome: "completed"; runId: string }
  | { outcome: "skipped" } // a live run already exists (scheduler path)
  | { outcome: "failed"; error: string };

/**
 * The whole run — supersede, match, persist, enqueue notifications — is one
 * transaction guarded by an advisory lock on (office, activity, date), so a
 * concurrent scheduler tick and admin re-run cannot interleave.
 */
export async function runMatch(opts: RunMatchOptions): Promise<RunMatchResult> {
  const startedAt = Date.now();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        matchAdvisoryLock(opts.officeId, opts.activityTypeId, opts.date),
      );

      const keyWhere = and(
        eq(matchRuns.officeId, opts.officeId),
        eq(matchRuns.activityTypeId, opts.activityTypeId),
        eq(matchRuns.date, opts.date),
      );
      const liveRuns = await tx
        .select()
        .from(matchRuns)
        .where(and(keyWhere, inArray(matchRuns.status, [...LIVE_STATUSES])));

      let superseded = false;
      if (opts.trigger === "scheduler") {
        if (liveRuns.length > 0) return { outcome: "skipped" as const };
      } else {
        for (const old of liveRuns) {
          await tx
            .update(matchRuns)
            .set({ status: "superseded" })
            .where(eq(matchRuns.id, old.id));
          // Their pairs must not feed the repeat penalty of the new run.
          await tx.delete(matchPairs).where(eq(matchPairs.matchRunId, old.id));
          // Undelivered notifications describe groups that no longer exist;
          // cancel them so no retry or crash-reclaim path can deliver stale
          // assignments. 'sending' rows are cancelled too: if SMTP already
          // accepted one, delivery is unavoidable, but the dispatcher's
          // compare-and-set transitions (WHERE status='sending') mean a
          // cancelled row is never resurrected to pending or re-sent.
          await tx
            .update(notifications)
            .set({ status: "cancelled" })
            .where(
              and(
                like(notifications.dedupeKey, `match:${old.id}:%`),
                inArray(notifications.status, ["pending", "sending"]),
              ),
            );
          superseded = true;
        }
      }

      const [{ value: priorRuns }] = await tx
        .select({ value: count() })
        .from(matchRuns)
        .where(keyWhere);
      const seed =
        `${opts.officeId}:${opts.activityTypeId}:${opts.date}` +
        (priorRuns > 0 ? `:r${priorRuns}` : "");

      const [run] = await tx
        .insert(matchRuns)
        .values({
          officeId: opts.officeId,
          activityTypeId: opts.activityTypeId,
          date: opts.date,
          seed,
          status: "running",
          triggeredBy: opts.trigger,
          triggeredByUserId: opts.triggeredByUserId,
          startedAt: new Date(),
        })
        .returning();

      if (opts.catchUpMaterialize) {
        const created = await materializeStanding(
          tx,
          opts.officeId,
          opts.activityTypeId,
          opts.date,
          opts.catchUpMaterialize.holidays,
          opts.catchUpMaterialize.updatedBefore,
        );
        if (created > 0) {
          console.log(
            `[match] catch-up materialized ${created} standing signup(s) for ${opts.officeId} ${opts.date}`,
          );
        }
      }

      // ---- Load engine inputs ------------------------------------------
      const pool: PoolMember[] = await tx
        .select({
          userId: signups.userId,
          department: users.department,
          sizePref: signups.groupSizePref,
          willingToHost: signups.willingToHost,
        })
        .from(signups)
        .innerJoin(users, eq(signups.userId, users.id))
        .where(
          and(
            eq(signups.officeId, opts.officeId),
            eq(signups.activityTypeId, opts.activityTypeId),
            eq(signups.date, opts.date),
            eq(signups.status, "active"),
          ),
        );

      const poolIds = pool.map((m) => m.userId);
      const pairHistory = new Map<string, LocalDate[]>();
      const hostStats: Map<
        string,
        { lastHostedDate: LocalDate | null; count: number }
      > = new Map();

      if (poolIds.length > 0) {
        const historyRows = await tx
          .select()
          .from(matchPairs)
          .where(
            and(
              gte(matchPairs.date, addDays(opts.date, -HISTORY_WINDOW_DAYS)),
              inArray(matchPairs.userLo, poolIds),
              inArray(matchPairs.userHi, poolIds),
            ),
          );
        for (const row of historyRows) {
          const key = pairKey(row.userLo, row.userHi);
          const list = pairHistory.get(key);
          if (list) list.push(row.date);
          else pairHistory.set(key, [row.date]);
        }

        const hostRows = await tx
          .select({
            hostUserId: matchGroups.hostUserId,
            lastHostedDate: max(matchGroups.date),
            hosted: count(),
          })
          .from(matchGroups)
          .innerJoin(matchRuns, eq(matchGroups.matchRunId, matchRuns.id))
          .where(
            and(
              eq(matchRuns.status, "completed"),
              gte(matchGroups.date, addDays(opts.date, -HOST_WINDOW_DAYS)),
              isNotNull(matchGroups.hostUserId),
              inArray(matchGroups.hostUserId, poolIds),
            ),
          )
          .groupBy(matchGroups.hostUserId);
        for (const row of hostRows) {
          if (row.hostUserId) {
            hostStats.set(row.hostUserId, {
              lastHostedDate: row.lastHostedDate,
              count: row.hosted,
            });
          }
        }
      }

      const officeCafeterias = await tx
        .select({ id: cafeterias.id })
        .from(cafeterias)
        .where(
          and(
            eq(cafeterias.officeId, opts.officeId),
            eq(cafeterias.isActive, true),
          ),
        );

      const result = matchEngine({
        pool,
        pairHistory,
        hostStats: hostStats as HostStats,
        cafeteriaIds: officeCafeterias.map((c) => c.id),
        today: opts.date,
        seed,
      });

      // ---- Persist groups, members, pairs ------------------------------
      for (let i = 0; i < result.groups.length; i++) {
        const g = result.groups[i];
        const [group] = await tx
          .insert(matchGroups)
          .values({
            matchRunId: run.id,
            groupIndex: i,
            hostUserId: g.hostUserId,
            cafeteriaId: g.cafeteriaId,
            officeId: opts.officeId,
            activityTypeId: opts.activityTypeId,
            date: opts.date,
          })
          .returning({ id: matchGroups.id });
        await tx.insert(matchGroupMembers).values(
          g.members.map((userId) => ({ groupId: group.id, userId })),
        );
        const pairRows = [];
        for (let a = 0; a < g.members.length; a++) {
          for (let b = a + 1; b < g.members.length; b++) {
            const [lo, hi] = [g.members[a], g.members[b]].sort();
            pairRows.push({
              userLo: lo,
              userHi: hi,
              date: opts.date,
              matchRunId: run.id,
            });
          }
        }
        if (pairRows.length > 0) {
          await tx.insert(matchPairs).values(pairRows).onConflictDoNothing();
        }
      }

      // ---- Enqueue notifications ---------------------------------------
      await enqueueNotifications(tx, {
        runId: run.id,
        officeId: opts.officeId,
        activityTypeId: opts.activityTypeId,
        date: opts.date,
        groups: result.groups,
        unmatched: result.unmatched,
        superseded,
      });

      const stats = {
        poolSize: pool.length,
        groupCount: result.groups.length,
        groupSizes: result.groups.map((g) => g.members.length),
        unmatchedCount: result.unmatched.length,
        totalCost: Math.round(result.totalCost * 1000) / 1000,
        durationMs: Date.now() - startedAt,
      };
      await tx
        .update(matchRuns)
        .set({ status: "completed", stats, completedAt: new Date() })
        .where(eq(matchRuns.id, run.id));

      return { outcome: "completed" as const, runId: run.id };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The transaction rolled back; record the failure outside it. The
    // partial unique index ignores 'failed' rows, so this always succeeds.
    await db
      .insert(matchRuns)
      .values({
        officeId: opts.officeId,
        activityTypeId: opts.activityTypeId,
        date: opts.date,
        seed: `${opts.officeId}:${opts.activityTypeId}:${opts.date}`,
        status: "failed",
        triggeredBy: opts.trigger,
        triggeredByUserId: opts.triggeredByUserId,
        error: message,
        startedAt: new Date(startedAt),
        completedAt: new Date(),
      })
      .catch(() => {});
    return { outcome: "failed", error: message };
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function enqueueNotifications(
  tx: Tx,
  args: {
    runId: string;
    officeId: string;
    activityTypeId: string;
    date: LocalDate;
    groups: Array<{
      members: string[];
      hostUserId: string | null;
      cafeteriaId: string | null;
    }>;
    unmatched: string[];
    superseded: boolean;
  },
) {
  const allUserIds = [
    ...args.groups.flatMap((g) => g.members),
    ...args.unmatched,
  ];
  if (allUserIds.length === 0) return;

  const [activity] = await tx
    .select()
    .from(activityTypes)
    .where(eq(activityTypes.id, args.activityTypeId));
  const [office] = await tx
    .select()
    .from(offices)
    .where(eq(offices.id, args.officeId));
  const cafRows = await tx
    .select()
    .from(cafeterias)
    .where(eq(cafeterias.officeId, args.officeId));
  const cafById = new Map(cafRows.map((c) => [c.id, c]));
  const userRows = await tx
    .select()
    .from(users)
    .where(inArray(users.id, allUserIds));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const base = {
    date: args.date,
    activity: {
      nameEn: activity.nameEn,
      nameZh: activity.nameZh,
      eventTime: activity.eventTime,
    },
    office: { nameEn: office.nameEn, nameZh: office.nameZh },
  };
  const groupTemplate = args.superseded ? "match_updated" : "match_result";

  const rows = [];
  for (const g of args.groups) {
    const venue = g.cafeteriaId ? cafById.get(g.cafeteriaId) : undefined;
    const payloadGroup: NonNullable<NotificationPayload["group"]> = {
      hostUserId: g.hostUserId,
      venue: venue ? { nameEn: venue.nameEn, nameZh: venue.nameZh } : null,
      members: g.members.flatMap((id) => {
        const u = userById.get(id);
        if (!u) return [];
        const isHost = id === g.hostUserId;
        return [
          {
            userId: id,
            name: u.name,
            department: u.department,
            email: u.email,
            contact: isHost || u.contactVisible ? u.contactExtra : null,
            isHost,
          },
        ];
      }),
    };
    for (const id of g.members) {
      const u = userById.get(id);
      if (!u) continue;
      const payload: NotificationPayload = {
        ...base,
        kind: groupTemplate,
        group: payloadGroup,
      };
      rows.push({
        userId: id,
        channel: "email" as const,
        template: groupTemplate as "match_result" | "match_updated",
        locale: u.locale,
        payload,
        dedupeKey: `match:${args.runId}:${id}`,
      });
    }
  }
  for (const id of args.unmatched) {
    const u = userById.get(id);
    if (!u) continue;
    const payload: NotificationPayload = { ...base, kind: "unmatched" };
    rows.push({
      userId: id,
      channel: "email" as const,
      template: "unmatched" as const,
      locale: u.locale,
      payload,
      dedupeKey: `match:${args.runId}:${id}`,
    });
  }

  if (rows.length > 0) {
    await tx.insert(notifications).values(rows).onConflictDoNothing();
  }
}
