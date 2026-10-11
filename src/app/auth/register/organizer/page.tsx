import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/forms/auth-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { RoleTabs } from "@/components/layout/role-tabs";
import { Alert } from "@/components/ui/misc";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Create organizer account", robots: { index: false } };

export default async function RegisterOrganizerPage() {
  if (await getCurrentUser()) redirect("/submit-event");
  const t = await getT();
  return (
    <AuthShell wide title={t("auth.organizerAccount")} desc={t("submit.applyDesc")}>
      <RoleTabs active="organizer" student={t("auth.studentAccount")} organizer={t("auth.organizerAccount")} />
      <Alert tone="info" className="mb-4 py-2">{t("auth.organizerNote")}</Alert>
      <Suspense><AuthForm mode="registerOrganizer" /></Suspense>
      <p className="mt-4 text-sm text-muted">{t("auth.switchToStudent")} <Link href="/auth/register" className="font-medium text-fg underline underline-offset-4">{t("auth.studentAccount")}</Link></p>
    </AuthShell>
  );
}
