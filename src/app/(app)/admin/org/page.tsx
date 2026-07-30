import { asc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { cafeterias, cities, offices } from "@/db/schema";
import {
  addCafeteria,
  addCity,
  addOffice,
  toggleCafeteria,
  toggleCity,
  toggleOffice,
} from "./actions";

function ToggleForm({
  id,
  action,
  active,
  labels,
}: {
  id: string;
  action: (formData: FormData) => Promise<void>;
  active: boolean;
  labels: { active: string; yes: string; no: string };
}) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost">
        <Badge variant={active ? "default" : "secondary"}>
          {labels.active}: {active ? labels.yes : labels.no}
        </Badge>
      </Button>
    </form>
  );
}

export default async function AdminOrgPage() {
  const t = await getTranslations("admin.org");
  const tc = await getTranslations("common");
  const cityRows = await db.select().from(cities).orderBy(asc(cities.nameEn));
  const officeRows = await db
    .select({
      office: offices,
      cityNameZh: cities.nameZh,
    })
    .from(offices)
    .innerJoin(cities, eq(offices.cityId, cities.id))
    .orderBy(asc(offices.nameEn));
  const cafRows = await db
    .select({
      caf: cafeterias,
      officeNameZh: offices.nameZh,
    })
    .from(cafeterias)
    .innerJoin(offices, eq(cafeterias.officeId, offices.id))
    .orderBy(asc(cafeterias.nameEn));

  const toggleLabels = {
    active: t("active"),
    yes: tc("yes"),
    no: tc("no"),
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("cities")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1 text-sm">
            {cityRows.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <span className="min-w-40">
                  {c.nameZh} / {c.nameEn}
                </span>
                <span className="text-muted-foreground">{c.timezone}</span>
                <ToggleForm
                  id={c.id}
                  action={toggleCity}
                  active={c.isActive}
                  labels={toggleLabels}
                />
              </li>
            ))}
          </ul>
          <form action={addCity} className="flex flex-wrap items-end gap-2">
            <Input name="nameZh" placeholder={t("nameZh")} className="w-36" required />
            <Input name="nameEn" placeholder={t("nameEn")} className="w-36" required />
            <Input
              name="timezone"
              placeholder="Asia/Shanghai"
              defaultValue="Asia/Shanghai"
              className="w-40"
              required
            />
            <Button type="submit" size="sm">
              {tc("add")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("offices")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1 text-sm">
            {officeRows.map(({ office, cityNameZh }) => (
              <li key={office.id} className="flex items-center gap-3">
                <span className="min-w-40">
                  {office.nameZh} / {office.nameEn}
                </span>
                <span className="text-muted-foreground">{cityNameZh}</span>
                <ToggleForm
                  id={office.id}
                  action={toggleOffice}
                  active={office.isActive}
                  labels={toggleLabels}
                />
              </li>
            ))}
          </ul>
          <form action={addOffice} className="flex flex-wrap items-end gap-2">
            <select
              name="cityId"
              className="h-8 rounded-md border bg-transparent px-2 text-sm"
              required
            >
              {cityRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameZh}
                </option>
              ))}
            </select>
            <Input name="nameZh" placeholder={t("nameZh")} className="w-36" required />
            <Input name="nameEn" placeholder={t("nameEn")} className="w-36" required />
            <Button type="submit" size="sm">
              {tc("add")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("cafeterias")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1 text-sm">
            {cafRows.map(({ caf, officeNameZh }) => (
              <li key={caf.id} className="flex items-center gap-3">
                <span className="min-w-40">
                  {caf.nameZh} / {caf.nameEn}
                </span>
                <span className="text-muted-foreground">{officeNameZh}</span>
                <ToggleForm
                  id={caf.id}
                  action={toggleCafeteria}
                  active={caf.isActive}
                  labels={toggleLabels}
                />
              </li>
            ))}
          </ul>
          <form action={addCafeteria} className="flex flex-wrap items-end gap-2">
            <select
              name="officeId"
              className="h-8 rounded-md border bg-transparent px-2 text-sm"
              required
            >
              {officeRows.map(({ office }) => (
                <option key={office.id} value={office.id}>
                  {office.nameZh}
                </option>
              ))}
            </select>
            <Input name="nameZh" placeholder={t("nameZh")} className="w-36" required />
            <Input name="nameEn" placeholder={t("nameEn")} className="w-36" required />
            <Button type="submit" size="sm">
              {tc("add")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
