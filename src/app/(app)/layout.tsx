import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { signOut } from "@/auth";
import { requireUser } from "@/auth/session";
import { Button } from "@/components/ui/button";
import { setLocale } from "../locale-actions";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const t = await getTranslations("common");
  const locale = await getLocale();
  const otherLocale = locale === "en" ? "zh-CN" : "en";

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-lg font-semibold">
            🍜 {t("appName")}
          </Link>
          <nav className="flex flex-wrap items-center gap-x-4 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              {t("nav.dashboard")}
            </Link>
            <Link href="/standing" className="hover:text-foreground">
              {t("nav.standing")}
            </Link>
            <Link href="/history" className="hover:text-foreground">
              {t("nav.history")}
            </Link>
            <Link href="/profile" className="hover:text-foreground">
              {t("nav.profile")}
            </Link>
            {user.isAdmin ? (
              <Link href="/admin" className="hover:text-foreground">
                {t("nav.admin")}
              </Link>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <form action={setLocale}>
              <input type="hidden" name="locale" value={otherLocale} />
              <Button variant="ghost" size="sm" type="submit">
                {otherLocale === "en" ? "EN" : "中文"}
              </Button>
            </form>
            <span className="text-sm text-muted-foreground">{user.name}</span>
            <form action={doSignOut}>
              <Button variant="ghost" size="sm" type="submit">
                {t("signOut")}
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
