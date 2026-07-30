import { notFound } from "next/navigation";
import { asc, eq, like } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import {
  activityTypes,
  cafeterias,
  matchGroupMembers,
  matchGroups,
  matchRuns,
  notifications,
  offices,
  users,
} from "@/db/schema";
import { rerunMatch } from "../actions";

export default async function AdminRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("admin.runs");
  const tg = await getTranslations("group");

  const [row] = await db
    .select({
      run: matchRuns,
      officeNameZh: offices.nameZh,
      activityKey: activityTypes.key,
    })
    .from(matchRuns)
    .innerJoin(offices, eq(matchRuns.officeId, offices.id))
    .innerJoin(activityTypes, eq(matchRuns.activityTypeId, activityTypes.id))
    .where(eq(matchRuns.id, id));
  if (!row) notFound();
  const { run, officeNameZh, activityKey } = row;

  const groups = await db
    .select({
      group: matchGroups,
      cafNameZh: cafeterias.nameZh,
    })
    .from(matchGroups)
    .leftJoin(cafeterias, eq(matchGroups.cafeteriaId, cafeterias.id))
    .where(eq(matchGroups.matchRunId, run.id))
    .orderBy(asc(matchGroups.groupIndex));

  const memberRows = groups.length
    ? await db
        .select({
          groupId: matchGroupMembers.groupId,
          userId: users.id,
          name: users.name,
          department: users.department,
        })
        .from(matchGroupMembers)
        .innerJoin(users, eq(matchGroupMembers.userId, users.id))
        .innerJoin(matchGroups, eq(matchGroupMembers.groupId, matchGroups.id))
        .where(eq(matchGroups.matchRunId, run.id))
    : [];

  const notifRows = await db
    .select({
      status: notifications.status,
      template: notifications.template,
      lastError: notifications.lastError,
      email: users.email,
    })
    .from(notifications)
    .innerJoin(users, eq(notifications.userId, users.id))
    .where(like(notifications.dedupeKey, `match:${run.id}:%`));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {run.date} · {officeNameZh} · {activityKey}
            <Badge>{run.status}</Badge>
          </CardTitle>
          <CardDescription className="flex flex-col gap-0.5">
            <span>
              {t("seed")}: <code>{run.seed}</code> · {t("trigger")}:{" "}
              {run.triggeredBy}
            </span>
            {run.error ? <span className="text-destructive">{run.error}</span> : null}
            {run.stats ? <code>{JSON.stringify(run.stats)}</code> : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={rerunMatch} className="flex items-center gap-3">
            <input type="hidden" name="officeId" value={run.officeId} />
            <input type="hidden" name="activityTypeId" value={run.activityTypeId} />
            <input type="hidden" name="date" value={run.date} />
            <Button type="submit" size="sm" variant="destructive">
              {t("rerun")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("rerunHint")}</span>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("groups")} ({groups.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {groups.map(({ group, cafNameZh }) => (
            <div key={group.id} className="rounded-md border p-3 text-sm">
              <div className="mb-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span>#{group.groupIndex + 1}</span>
                {cafNameZh ? <span>📍 {cafNameZh}</span> : null}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {memberRows
                  .filter((m) => m.groupId === group.id)
                  .map((m) => (
                    <li key={m.userId} className="flex items-center gap-1.5">
                      {m.name}
                      {m.userId === group.hostUserId ? (
                        <Badge>{tg("host")}</Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {m.department}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("notifications")} ({notifRows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm">
            {notifRows.map((n, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    n.status === "sent"
                      ? "default"
                      : n.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {n.status}
                </Badge>
                <span>{n.email}</span>
                <span className="text-xs text-muted-foreground">{n.template}</span>
                {n.lastError ? (
                  <span className="text-xs text-destructive">{n.lastError}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
