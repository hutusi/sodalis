import { getTranslations } from "next-intl/server";

import { requireUser } from "@/auth/session";

export default async function DashboardPage() {
  await requireUser();
  const t = await getTranslations("dashboard");
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {/* Signup flows land in M3. */}
    </div>
  );
}
