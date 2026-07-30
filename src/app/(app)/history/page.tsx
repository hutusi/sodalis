import { getLocale, getTranslations } from "next-intl/server";

import { requireUser } from "@/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { formatDateLabel } from "@/lib/format";
import { getMetHistory } from "@/lib/queries";

export default async function HistoryPage() {
  const user = await requireUser();
  const t = await getTranslations("history");
  const locale = await getLocale();
  const people = await getMetHistory(user.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {people.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>{t("empty")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <ul className="flex flex-col">
              {people.map((p) => (
                <li
                  key={p.userId}
                  className="flex flex-wrap items-center gap-2 border-b py-3 text-sm last:border-b-0"
                >
                  <span className="font-medium">{p.name}</span>
                  {p.department ? (
                    <span className="text-muted-foreground">{p.department}</span>
                  ) : null}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t("timesMet", { count: p.timesMet })} ·{" "}
                    {formatDateLabel(p.lastDate, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
