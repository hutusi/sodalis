import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth, devLoginEnabled, ldapEnabled, oidcEnabled } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { devSignIn, ldapSignIn, ssoSignIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const { error } = await searchParams;
  const t = await getTranslations("login");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <p className="text-sm text-destructive">{t("error")}</p>
          ) : null}

          {oidcEnabled ? (
            <form action={ssoSignIn}>
              <Button type="submit" className="w-full">
                {t("sso")}
              </Button>
            </form>
          ) : null}

          {ldapEnabled ? (
            <details open={!oidcEnabled}>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {t("ldapToggle")}
              </summary>
              <form action={ldapSignIn} className="mt-3 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="username">{t("username")}</Label>
                  <Input id="username" name="username" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">{t("password")}</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                  />
                </div>
                <Button type="submit" variant="outline">
                  {t("ldapSubmit")}
                </Button>
              </form>
            </details>
          ) : null}

          {devLoginEnabled ? (
            <>
              <Separator />
              <form action={devSignIn} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">
                    {t("devTitle")} · {t("devEmail")}
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="wang.wei@corp.example.com"
                    required
                  />
                </div>
                <Button type="submit" variant="secondary">
                  {t("devSubmit")}
                </Button>
              </form>
            </>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
