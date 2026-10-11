import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/forms/auth-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { Alert } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [t, { token }] = await Promise.all([getT(), searchParams]);
  return (
    <AuthShell title={t("auth.resetTitle")}>
      {token ? <Suspense><AuthForm mode="reset" token={token} /></Suspense> : <Alert tone="error">{t("auth.resetInvalid")}</Alert>}
    </AuthShell>
  );
}
