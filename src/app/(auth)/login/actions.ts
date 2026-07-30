"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";

export async function ssoSignIn() {
  await signIn("oidc", { redirectTo: "/" });
}

export async function ldapSignIn(formData: FormData) {
  try {
    await signIn("ldap", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=1");
    throw error;
  }
}

export async function devSignIn(formData: FormData) {
  try {
    await signIn("dev", {
      email: formData.get("email"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=1");
    throw error;
  }
}
