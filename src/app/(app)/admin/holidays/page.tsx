import { asc } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { holidayCalendar } from "@/db/schema";
import { formatDateLabel } from "@/lib/format";
import { addCalendarDay, deleteCalendarDay } from "./actions";

export default async function AdminHolidaysPage() {
  const t = await getTranslations("admin.holidays");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const rows = await db
    .select()
    .from(holidayCalendar)
    .orderBy(asc(holidayCalendar.date));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={addCalendarDay} className="flex flex-wrap items-end gap-2">
          <Input name="date" type="date" className="w-40" required />
          <select
            name="kind"
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="holiday">{t("holiday")}</option>
            <option value="workday">{t("workday")}</option>
          </select>
          <Input name="label" placeholder={t("label")} className="w-44" required />
          <Button type="submit" size="sm">
            {t("addDay")}
          </Button>
        </form>

        <ul className="flex flex-col text-sm">
          {rows.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-3 border-b py-1.5 last:border-b-0"
            >
              <span className="w-28 tabular-nums">{d.date}</span>
              <span className="w-28 text-muted-foreground">
                {formatDateLabel(d.date, locale)}
              </span>
              <Badge variant={d.kind === "holiday" ? "secondary" : "default"}>
                {d.kind === "holiday" ? t("holiday") : t("workday")}
              </Badge>
              <span>{d.label}</span>
              <form action={deleteCalendarDay} className="ml-auto">
                <input type="hidden" name="id" value={d.id} />
                <Button type="submit" size="sm" variant="ghost">
                  {tc("delete")}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
