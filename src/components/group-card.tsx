import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import type { GroupView } from "@/lib/queries";
import { formatWallTime } from "@/lib/time";

export async function GroupCard({
  group,
  eventTime,
  selfId,
}: {
  group: GroupView;
  eventTime: string;
  selfId: string;
}) {
  const t = await getTranslations("group");
  const locale = await getLocale();

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span>
          🕒 {t("eventTime")}: <b>{formatWallTime(eventTime)}</b>
        </span>
        {group.venue ? (
          <span title={t("venueHint")}>
            📍 {t("venue")}:{" "}
            <b>{locale === "en" ? group.venue.nameEn : group.venue.nameZh}</b>
          </span>
        ) : null}
        {group.hostUserId === null ? (
          <span className="text-muted-foreground">{t("hostless")}</span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {group.members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-2 text-sm">
            <span className={m.userId === selfId ? "font-semibold" : ""}>
              {m.name}
            </span>
            {m.isHost ? <Badge>{t("host")}</Badge> : null}
            {m.department ? (
              <span className="text-muted-foreground">{m.department}</span>
            ) : null}
            <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
              <a href={`mailto:${m.email}`} className="hover:underline">
                {m.email}
              </a>
              {m.contact ? <span>{m.contact}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
