import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/forms/auth-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const t = await getT();
  return (
    <AuthShell title={t("auth.loginTitle")} desc={t("auth.loginDesc")}>
      <Suspense><AuthForm mode="login" /></Suspense>
    </AuthShell>
  );
}
