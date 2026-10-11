import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/forms/auth-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { RoleTabs } from "@/components/layout/role-tabs";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const t = await getT();
  return (
    <AuthShell title={t("auth.registerTitle")} desc={t("auth.registerDesc")}>
      <RoleTabs active="student" student={t("auth.studentAccount")} organizer={t("auth.organizerAccount")} />
      <Suspense><AuthForm mode="register" /></Suspense>
      <p className="mt-4 text-sm text-muted">{t("auth.switchToOrganizer")} <Link href="/auth/register/organizer" className="font-medium text-fg underline underline-offset-4">{t("auth.organizerAccount")}</Link></p>
    </AuthShell>
  );
}
