import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { activityTypes } from "@/db/schema";
import { formatWallTime } from "@/lib/time";
import { addActivity, updateActivity } from "./actions";

export default async function AdminActivitiesPage() {
  const t = await getTranslations("admin.activities");
  const tOrg = await getTranslations("admin.org");
  const tc = await getTranslations("common");
  const rows = await db
    .select()
    .from(activityTypes)
    .orderBy(asc(activityTypes.key));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.map((a) => (
          <form
            key={a.id}
            action={updateActivity}
            className="flex flex-wrap items-end gap-2 border-b pb-4 last:border-b-0"
          >
            <input type="hidden" name="id" value={a.id} />
            <span className="w-20 text-sm font-mono">{a.key}</span>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {tOrg("nameZh")}
              <Input name="nameZh" defaultValue={a.nameZh} className="w-28" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {tOrg("nameEn")}
              <Input name="nameEn" defaultValue={a.nameEn} className="w-28" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("close")}
              <Input
                name="signupCloseTime"
                type="time"
                defaultValue={formatWallTime(a.signupCloseTime)}
                className="w-28"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("notifyBy")}
              <Input
                name="notifyByTime"
                type="time"
                defaultValue={formatWallTime(a.notifyByTime)}
                className="w-28"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("eventAt")}
              <Input
                name="eventTime"
                type="time"
                defaultValue={formatWallTime(a.eventTime)}
                className="w-28"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={a.isActive} />
              {tOrg("active")}
            </label>
            <Button type="submit" size="sm">
              {tc("save")}
            </Button>
          </form>
        ))}

        <form action={addActivity} className="flex flex-wrap items-end gap-2">
          <Input name="key" placeholder="dinner" className="w-20 font-mono" required />
          <Input name="nameZh" placeholder={tOrg("nameZh")} className="w-28" required />
          <Input name="nameEn" placeholder={tOrg("nameEn")} className="w-28" required />
          <Input name="signupCloseTime" type="time" defaultValue="16:30" className="w-28" />
          <Input name="notifyByTime" type="time" defaultValue="17:00" className="w-28" />
          <Input name="eventTime" type="time" defaultValue="18:00" className="w-28" />
          <Button type="submit" size="sm" variant="outline">
            {tc("add")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
