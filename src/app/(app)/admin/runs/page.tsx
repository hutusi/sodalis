import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { db } from "@/db";
import { activityTypes, matchRuns, offices } from "@/db/schema";

const STATUS_VARIANT = {
  completed: "default",
  superseded: "secondary",
  failed: "destructive",
  pending: "outline",
  running: "outline",
} as const;

type RunStats = {
  poolSize?: number;
  groupCount?: number;
  unmatchedCount?: number;
} | null;

export default async function AdminRunsPage() {
  const t = await getTranslations("admin.runs");
  const rows = await db
    .select({
      run: matchRuns,
      officeNameZh: offices.nameZh,
      activityKey: activityTypes.key,
    })
    .from(matchRuns)
    .innerJoin(offices, eq(matchRuns.officeId, offices.id))
    .innerJoin(activityTypes, eq(matchRuns.activityTypeId, activityTypes.id))
    .orderBy(desc(matchRuns.date), desc(matchRuns.createdAt))
    .limit(50);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>{t("noRuns")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-4">{t("date")}</th>
              <th className="py-2 pr-4">{t("office")}</th>
              <th className="py-2 pr-4">{t("status")}</th>
              <th className="py-2 pr-4">{t("trigger")}</th>
              <th className="py-2 pr-4">{t("pool")}</th>
              <th className="py-2 pr-4">{t("groups")}</th>
              <th className="py-2">{t("unmatched")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ run, officeNameZh, activityKey }) => {
              const stats = run.stats as RunStats;
              return (
                <tr key={run.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 tabular-nums">
                    <Link
                      href={`/admin/runs/${run.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {run.date}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    {officeNameZh}{" "}
                    <span className="text-muted-foreground">{activityKey}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant={STATUS_VARIANT[run.status]}>
                      {run.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">{run.triggeredBy}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {stats?.poolSize ?? "—"}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {stats?.groupCount ?? "—"}
                  </td>
                  <td className="py-2 tabular-nums">
                    {stats?.unmatchedCount ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
