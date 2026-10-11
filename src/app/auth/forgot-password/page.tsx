import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/forms/auth-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default async function ForgotPage() {
  const t = await getT();
  return (
    <AuthShell title={t("auth.forgotTitle")} desc={t("auth.forgotDesc")}>
      <Suspense><AuthForm mode="forgot" /></Suspense>
    </AuthShell>
  );
}
