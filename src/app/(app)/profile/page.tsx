import { getLocale, getTranslations } from "next-intl/server";

import { requireUser } from "@/auth/session";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listOfficesWithCity } from "@/lib/queries";
import { saveProfile } from "./actions";

export default async function ProfilePage() {
  const user = await requireUser();
  const t = await getTranslations("profile");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const officeList = await listOfficesWithCity();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{user.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("email")}</dt>
            <dd>{user.email}</dd>
            <dt className="text-muted-foreground">{t("department")}</dt>
            <dd>
              {user.department ?? tc("none")}
              <span className="ml-2 text-xs text-muted-foreground">
                {t("departmentHint")}
              </span>
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <form action={saveProfile} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="officeId">{t("office")}</Label>
              <select
                id="officeId"
                name="officeId"
                defaultValue={user.officeId ?? ""}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">{t("selectOffice")}</option>
                {officeList.map((o) => (
                  <option key={o.id} value={o.id}>
                    {locale === "en"
                      ? `${o.cityNameEn} · ${o.nameEn}`
                      : `${o.cityNameZh} · ${o.nameZh}`}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t("officeHint")}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="locale">{t("language")}</Label>
              <select
                id="locale"
                name="locale"
                defaultValue={user.locale}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contactExtra">{t("contact")}</Label>
              <Input
                id="contactExtra"
                name="contactExtra"
                defaultValue={user.contactExtra ?? ""}
                placeholder={t("contactPlaceholder")}
              />
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="contactVisible"
                  defaultChecked={user.contactVisible}
                />
                {t("contactVisible")}
              </label>
            </div>

            <Button type="submit" className="self-start">
              {tc("save")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
