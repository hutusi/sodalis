import { eq, and } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/auth/session";
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
import { standingSignups } from "@/db/schema";
import { getPrimaryActivity } from "@/lib/queries";
import {
  pauseStanding,
  removeStanding,
  resumeStanding,
  saveStanding,
} from "./actions";

const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const WEEKDAY_KEYS = { 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri" } as const;

export default async function StandingPage() {
  const user = await requireUser();
  const t = await getTranslations("standing");
  const td = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const activity = await getPrimaryActivity();
  if (!activity) return null;

  const existing = await db.query.standingSignups.findFirst({
    where: and(
      eq(standingSignups.userId, user.id),
      eq(standingSignups.activityTypeId, activity.id),
    ),
  });
  const selected = new Set(existing?.weekdays ?? []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {t("weekdays")}
            {existing?.isPaused ? (
              <Badge variant="secondary">{t("paused")}</Badge>
            ) : null}
          </CardTitle>
          {!existing ? (
            <CardDescription>{t("notConfigured")}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={saveStanding} className="flex flex-col gap-4">
            <input type="hidden" name="activityTypeId" value={activity.id} />
            <div className="flex flex-wrap gap-4">
              {WEEKDAYS.map((wd) => (
                <label key={wd} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={wd}
                    defaultChecked={selected.has(wd)}
                  />
                  {t(WEEKDAY_KEYS[wd])}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <select
                name="sizePref"
                defaultValue={existing?.groupSizePref ?? "flex_2_4"}
                className="h-8 rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="flex_2_4">{td("sizeFlex")}</option>
                <option value="pair_only">{td("sizePairOnly")}</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="willingToHost"
                  defaultChecked={existing?.willingToHost ?? false}
                />
                {td("willingToHost")}
              </label>
              <Button type="submit" size="sm">
                {tc("save")}
              </Button>
            </div>
          </form>

          {existing ? (
            <div className="flex gap-2 border-t pt-4">
              {existing.isPaused ? (
                <form action={resumeStanding}>
                  <input type="hidden" name="id" value={existing.id} />
                  <Button type="submit" size="sm" variant="outline">
                    {t("resume")}
                  </Button>
                </form>
              ) : (
                <form action={pauseStanding}>
                  <input type="hidden" name="id" value={existing.id} />
                  <Button type="submit" size="sm" variant="outline">
                    {t("pause")}
                  </Button>
                </form>
              )}
              <form action={removeStanding}>
                <input type="hidden" name="id" value={existing.id} />
                <Button type="submit" size="sm" variant="ghost">
                  {t("remove")}
                </Button>
              </form>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
