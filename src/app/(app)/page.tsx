import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { requireUser } from "@/auth/session";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dayOffReason, nextWorkingDays } from "@/lib/calendar";
import { formatDateLabel } from "@/lib/format";
import {
  getOfficeContext,
  getPrimaryActivity,
  getUserSignups,
  loadHolidayMap,
} from "@/lib/queries";
import {
  addDays,
  composeLocalTime,
  formatWallTime,
  localDateFor,
} from "@/lib/time";
import { cancelSignup, upsertSignup } from "./actions";

type Signup = Awaited<ReturnType<typeof getUserSignups>>[number];

function SignupForm({
  activityTypeId,
  date,
  signup,
  labels,
}: {
  activityTypeId: string;
  date: string;
  signup: Signup | undefined;
  labels: {
    join: string;
    leave: string;
    save: string;
    sizePairOnly: string;
    sizeFlex: string;
    willingToHost: string;
  };
}) {
  const active = signup?.status === "active";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={upsertSignup} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="activityTypeId" value={activityTypeId} />
        <input type="hidden" name="date" value={date} />
        <select
          name="sizePref"
          defaultValue={signup?.groupSizePref ?? "flex_2_4"}
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="flex_2_4">{labels.sizeFlex}</option>
          <option value="pair_only">{labels.sizePairOnly}</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            name="willingToHost"
            defaultChecked={signup?.willingToHost ?? false}
          />
          {labels.willingToHost}
        </label>
        <Button type="submit" size="sm" variant={active ? "outline" : "default"}>
          {active ? labels.save : labels.join}
        </Button>
      </form>
      {active ? (
        <form action={cancelSignup}>
          <input type="hidden" name="activityTypeId" value={activityTypeId} />
          <input type="hidden" name="date" value={date} />
          <Button type="submit" size="sm" variant="ghost">
            {labels.leave}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getTranslations("dashboard");
  const locale = await getLocale();

  if (!user.officeId) {
    const tc = await getTranslations("common");
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("noOffice")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/profile" className={buttonVariants()}>
            {tc("nav.profile")} →
          </Link>
        </CardContent>
      </Card>
    );
  }

  const [octx, activity] = await Promise.all([
    getOfficeContext(user.officeId),
    getPrimaryActivity(),
  ]);
  if (!octx || !activity) return <p>{t("notWorkingDay", { reason: "—" })}</p>;

  const now = new Date();
  const today = localDateFor(now, octx.timezone);
  const holidays = await loadHolidayMap(today, addDays(today, 30));
  const days = nextWorkingDays(today, 5, holidays);
  const userSignups = await getUserSignups(user.id, activity.id, days);
  const byDate = new Map(userSignups.map((s) => [s.date, s]));

  const closeAt = composeLocalTime(today, activity.signupCloseTime, octx.timezone);
  const todayOpen = now.getTime() < closeAt.getTime();
  const closeLabel = formatWallTime(activity.signupCloseTime);
  const offReason = dayOffReason(today, holidays);
  const todaySignup = byDate.get(today);

  const labels = {
    join: t("join"),
    leave: t("leave"),
    save: (await getTranslations("common"))("save"),
    sizePairOnly: t("sizePairOnly"),
    sizeFlex: t("sizeFlex"),
    willingToHost: t("willingToHost"),
  };
  const activityName = locale === "en" ? activity.nameEn : activity.nameZh;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("today")} · {formatDateLabel(today, locale)}
            {offReason === null ? (
              <Badge variant={todayOpen ? "default" : "secondary"}>
                {todayOpen
                  ? t("signupOpen", { time: closeLabel })
                  : t("signupClosed", { time: closeLabel })}
              </Badge>
            ) : null}
          </CardTitle>
          {offReason !== null ? (
            <CardDescription>
              {t("notWorkingDay", { reason: t(offReason) })}
            </CardDescription>
          ) : (
            <CardDescription>
              {todaySignup?.status === "active"
                ? t("signedUp", { activity: activityName, date: formatDateLabel(today, locale) })
                : t("notSignedUp")}
            </CardDescription>
          )}
        </CardHeader>
        {offReason === null && todayOpen ? (
          <CardContent>
            <SignupForm
              activityTypeId={activity.id}
              date={today}
              signup={todaySignup}
              labels={labels}
            />
          </CardContent>
        ) : null}
        {/* Matched group card lands in M6. */}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("upcoming")}</CardTitle>
          <CardDescription>{t("hostHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {days
            .filter((d) => d !== today)
            .map((date) => {
              const signup = byDate.get(date);
              return (
                <div
                  key={date}
                  className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-28 text-sm font-medium">
                      {formatDateLabel(date, locale)}
                    </span>
                    {signup?.status === "active" ? (
                      <Badge variant="secondary">✓</Badge>
                    ) : null}
                  </div>
                  <SignupForm
                    activityTypeId={activity.id}
                    date={date}
                    signup={signup}
                    labels={labels}
                  />
                </div>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}
