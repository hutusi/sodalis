import { and, count, eq, gte, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { db } from "@/db";
import { cities, matchRuns, notifications, offices, signups } from "@/db/schema";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { localDateFor } from "@/lib/time";

export default async function AdminOverviewPage() {
  const t = await getTranslations("admin.overview");
  const now = new Date();

  const officeRows = await db
    .select({ timezone: cities.timezone })
    .from(offices)
    .innerJoin(cities, eq(offices.cityId, cities.id))
    .where(eq(offices.isActive, true));
  const todays = [...new Set(officeRows.map((o) => localDateFor(now, o.timezone)))];

  const [signupsToday] = todays.length
    ? await db
        .select({ value: count() })
        .from(signups)
        .where(
          and(inArray(signups.date, todays), eq(signups.status, "active")),
        )
    : [{ value: 0 }];
  const [runsToday] = todays.length
    ? await db
        .select({ value: count() })
        .from(matchRuns)
        .where(inArray(matchRuns.date, todays))
    : [{ value: 0 }];
  const [pendingNotifs] = await db
    .select({ value: count() })
    .from(notifications)
    .where(inArray(notifications.status, ["pending", "sending"]));
  const [failedNotifs] = await db
    .select({ value: count() })
    .from(notifications)
    .where(eq(notifications.status, "failed"));

  const cards = [
    { label: t("signupsToday"), value: signupsToday.value },
    { label: t("runsToday"), value: runsToday.value },
    { label: t("pendingNotifications"), value: pendingNotifs.value },
    { label: t("failedNotifications"), value: failedNotifs.value },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader>
            <CardTitle className="text-2xl tabular-nums">{c.value}</CardTitle>
            <CardDescription>{c.label}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
