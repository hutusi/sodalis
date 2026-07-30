import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireAdmin } from "@/auth/session";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();
  const t = await getTranslations("admin");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b pb-3">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <nav className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            {t("nav.overview")}
          </Link>
          <Link href="/admin/org" className="hover:text-foreground">
            {t("nav.org")}
          </Link>
          <Link href="/admin/activities" className="hover:text-foreground">
            {t("nav.activities")}
          </Link>
          <Link href="/admin/holidays" className="hover:text-foreground">
            {t("nav.holidays")}
          </Link>
          <Link href="/admin/runs" className="hover:text-foreground">
            {t("nav.runs")}
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
